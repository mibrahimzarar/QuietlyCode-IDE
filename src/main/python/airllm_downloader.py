"""
AirLLM Model Downloader
=======================
Downloads HuggingFace models using huggingface_hub.
Communicates progress to the parent process via stdout JSON lines.

Usage:
    python airllm_downloader.py <model_id> [target_dir]

Protocol (stdout):
    {"type":"progress","progress":45,"speed":"12.3 MB/s","downloaded":"5.4 GB","total":"12.1 GB"}
    {"type":"complete","path":"/path/to/model"}
    {"type":"error","message":"..."}
"""

import sys
import json
import time
import os
import threading


def send(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def format_size(bytes_val: float) -> str:
    if bytes_val >= 1024 ** 3:
        return f"{bytes_val / (1024 ** 3):.1f} GB"
    elif bytes_val >= 1024 ** 2:
        return f"{bytes_val / (1024 ** 2):.1f} MB"
    elif bytes_val >= 1024:
        return f"{bytes_val / 1024:.0f} KB"
    return f"{bytes_val:.0f} B"


def format_speed(bytes_per_sec: float) -> str:
    if bytes_per_sec >= 1024 ** 2:
        return f"{bytes_per_sec / (1024 ** 2):.1f} MB/s"
    elif bytes_per_sec >= 1024:
        return f"{bytes_per_sec / 1024:.0f} KB/s"
    return f"{bytes_per_sec:.0f} B/s"


def main():
    if len(sys.argv) < 2:
        send({"type": "error", "message": "Usage: airllm_downloader.py <model_id> [target_dir]"})
        sys.exit(1)

    model_id = sys.argv[1]
    target_dir = sys.argv[2] if len(sys.argv) > 2 else None

    try:
        from huggingface_hub import snapshot_download, HfApi
    except ImportError:
        send({"type": "progress", "progress": 0, "speed": "Installing dependencies...", "downloaded": "0 B", "total": "Setup"})
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "huggingface_hub"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        from huggingface_hub import snapshot_download, HfApi

    send({"type": "progress", "progress": 0, "speed": "Starting...", "downloaded": "0 B", "total": "Calculating..."})

    try:
        # Get model info for total size estimate
        api = HfApi()
        try:
            model_info = api.model_info(model_id)
            total_size = sum(s.size for s in (model_info.siblings or []) if s.size)
        except Exception:
            total_size = 0

        # Track download progress via a background thread monitoring disk usage
        download_path = [None]
        download_done = threading.Event()
        download_error = [None]

        def do_download():
            try:
                kwargs = {"repo_id": model_id, "repo_type": "model"}
                if target_dir:
                    kwargs["local_dir"] = os.path.join(target_dir, model_id.replace("/", "_"))
                    kwargs["local_dir_use_symlinks"] = False

                path = snapshot_download(**kwargs)
                download_path[0] = path
            except Exception as e:
                download_error[0] = str(e)
            finally:
                download_done.set()

        thread = threading.Thread(target=do_download, daemon=True)
        thread.start()

        # Monitor progress by watching disk usage
        last_bytes = 0
        last_time = time.time()
        check_dir = os.path.join(target_dir, model_id.replace("/", "_")) if target_dir else None

        while not download_done.is_set():
            time.sleep(1)

            if check_dir and os.path.exists(check_dir):
                try:
                    current_bytes = sum(
                        os.path.getsize(os.path.join(dp, f))
                        for dp, _, fnames in os.walk(check_dir)
                        for f in fnames
                    )
                except OSError:
                    current_bytes = last_bytes

                now = time.time()
                elapsed = now - last_time
                if elapsed > 0:
                    speed = (current_bytes - last_bytes) / elapsed
                else:
                    speed = 0

                progress = (current_bytes / total_size * 100) if total_size > 0 else 0
                progress = min(progress, 99)

                send({
                    "type": "progress",
                    "progress": round(progress),
                    "speed": format_speed(speed),
                    "downloaded": format_size(current_bytes),
                    "total": format_size(total_size) if total_size > 0 else "Unknown"
                })

                last_bytes = current_bytes
                last_time = now

        if download_error[0]:
            send({"type": "error", "message": download_error[0]})
            sys.exit(1)

        send({"type": "progress", "progress": 100, "speed": "0 B/s", "downloaded": format_size(total_size), "total": format_size(total_size)})
        send({"type": "complete", "path": download_path[0] or ""})

    except Exception as e:
        send({"type": "error", "message": str(e)})
        sys.exit(1)


if __name__ == "__main__":
    main()
