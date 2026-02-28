"""
AirLLM JSON-RPC Server
======================
Long-running stdin/stdout subprocess for QuietlyCode IDE.

Protocol
--------
- Input  (stdin):  one JSON object per line
- Output (stdout): one JSON object per line

Startup:
    Reads config from first stdin line:
        {"action":"init","model_id":"...","compression":"4bit","max_length":128}
    Emits {"type":"ready"} when model is loaded.

Generate:
    Input:  {"action":"generate","prompt":"...","max_new_tokens":64}
    Output: {"type":"chunk","text":"..."} per token, then {"type":"done","text":"<full>"}

Stop:
    Input:  {"action":"stop"}
    Process exits cleanly.
"""

import sys
import json
import traceback

def send(obj: dict) -> None:
    """Write a JSON line to stdout and flush immediately."""
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def main() -> None:
    model = None

    while True:
        try:
            raw = sys.stdin.readline()
            if not raw:
                break  # EOF — parent process closed pipe

            raw = raw.strip()
            if not raw:
                continue

            msg = json.loads(raw)
            action = msg.get("action")

            # ---- INIT ----
            if action == "init":
                try:
                    try:
                        from airllm import AutoModel
                    except ImportError:
                        import subprocess
                        send({"type": "status", "message": "Installing AirLLM dependencies (first run)..."})
                        subprocess.check_call([sys.executable, "-m", "pip", "install", "airllm", "torch", "huggingface_hub"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        from airllm import AutoModel

                    model_id = msg.get("model_id", "Qwen/Qwen2.5-7B-Instruct")
                    compression = msg.get("compression")  # "4bit", "8bit", or None
                    max_length = msg.get("max_length", 128)

                    load_kwargs: dict = {"max_length": max_length}
                    if compression and compression != "none":
                        load_kwargs["compression"] = compression

                    send({"type": "status", "message": f"Loading model {model_id} ..."})

                    model = AutoModel.from_pretrained(model_id, **load_kwargs)

                    send({"type": "ready"})

                except Exception as e:
                    send({"type": "error", "message": f"Failed to load model: {e}"})

            # ---- GENERATE ----
            elif action == "generate":
                if model is None:
                    send({"type": "error", "message": "Model not loaded. Send init first."})
                    continue

                prompt = msg.get("prompt", "")
                max_new_tokens = msg.get("max_new_tokens", 64)

                try:
                    # Tokenize
                    input_ids = model.tokenizer(
                        prompt,
                        return_tensors="pt",
                        return_attention_mask=False,
                        truncation=True,
                        max_length=msg.get("max_length", 128),
                    )
                    input_ids = input_ids["input_ids"].cuda()

                    # Generate
                    output_ids = model.generate(
                        input_ids=input_ids,
                        max_new_tokens=max_new_tokens,
                        do_sample=True,
                        top_p=0.9,
                        temperature=msg.get("temperature", 0.7),
                    )

                    full_text = model.tokenizer.decode(
                        output_ids[0], skip_special_tokens=True
                    )

                    # Strip the original prompt from the output if echoed
                    generated = full_text
                    if generated.startswith(prompt):
                        generated = generated[len(prompt):]

                    # Emit the response as streaming-style chunks for UI consistency
                    # AirLLM doesn't support true token-by-token streaming, so we
                    # simulate it by splitting the output into small pieces.
                    chunk_size = 4  # characters per chunk
                    for i in range(0, len(generated), chunk_size):
                        send({"type": "chunk", "text": generated[i : i + chunk_size]})

                    send({"type": "done", "text": generated})

                except Exception as e:
                    send({"type": "error", "message": f"Generation failed: {e}"})

            # ---- STOP ----
            elif action == "stop":
                send({"type": "stopped"})
                break

            else:
                send({"type": "error", "message": f"Unknown action: {action}"})

        except json.JSONDecodeError as e:
            send({"type": "error", "message": f"Invalid JSON: {e}"})
        except Exception as e:
            send({"type": "error", "message": f"Server error: {traceback.format_exc()}"})


if __name__ == "__main__":
    main()
