"""
AirLLM Local Inference Module
=============================
Provides layer-wise LLM inference with minimal VRAM usage (< 4GB)
using the AirLLM library. Supports 4-bit and 8-bit compression.
"""

from airllm import AutoModel


class AirLLMInference:
    """
    A wrapper around AirLLM's AutoModel for local large-language-model
    inference with layer-wise processing, keeping VRAM usage under 4GB.

    Parameters
    ----------
    model_id : str
        A Hugging Face model identifier (e.g. ``'Qwen/Qwen2.5-7B-Instruct'``)
        or an absolute path to a locally stored model directory.
    compression : str or None
        Quantization level applied when loading the model.
        Accepted values: ``'4bit'``, ``'8bit'``, or ``None`` (no compression).
    max_length : int
        Maximum sequence length (prompt + generated tokens combined).
        AirLLM uses this to size internal KV-cache buffers; keeping it
        small is the primary lever for constraining VRAM.

    Example
    -------
    >>> llm = AirLLMInference(
    ...     model_id="Qwen/Qwen2.5-7B-Instruct",
    ...     compression="4bit",
    ...     max_length=128,
    ... )
    >>> print(llm.generate("Explain quantum computing in one sentence."))
    """

    SUPPORTED_COMPRESSIONS = {"4bit", "8bit", None}

    def __init__(
        self,
        model_id: str = "Qwen/Qwen2.5-7B-Instruct",
        compression: str | None = None,
        max_length: int = 128,
    ) -> None:
        if compression not in self.SUPPORTED_COMPRESSIONS:
            raise ValueError(
                f"Unsupported compression '{compression}'. "
                f"Choose from {self.SUPPORTED_COMPRESSIONS}."
            )

        self.model_id = model_id
        self.compression = compression
        self.max_length = max_length

        # ---------- Load model with layer-wise inference ----------
        load_kwargs: dict = {"max_length": self.max_length}
        if self.compression is not None:
            load_kwargs["compression"] = self.compression

        self.model = AutoModel.from_pretrained(
            self.model_id,
            **load_kwargs,
        )

    # ------------------------------------------------------------------ #
    #  Generation
    # ------------------------------------------------------------------ #
    def generate(
        self,
        prompt: str,
        max_new_tokens: int = 64,
    ) -> str:
        """
        Tokenize *prompt*, run layer-wise inference on GPU, and return
        the decoded output string.

        Parameters
        ----------
        prompt : str
            The input text to feed into the model.
        max_new_tokens : int
            Maximum number of new tokens the model may produce.

        Returns
        -------
        str
            The model's generated text (decoded from token IDs).
        """
        # Tokenize using the model's bundled tokenizer
        input_ids = self.model.tokenizer(
            prompt,
            return_tensors="pt",
            return_attention_mask=False,
            truncation=True,
            max_length=self.max_length,
        )

        # Move input tensors to GPU for layer-wise forward passes
        input_ids = input_ids["input_ids"].cuda()

        # Generate — AirLLM streams layers through VRAM one at a time
        output_ids = self.model.generate(
            input_ids=input_ids,
            max_new_tokens=max_new_tokens,
            do_sample=True,
            top_p=0.9,
            temperature=0.7,
        )

        # Decode the full output (prompt + generated tokens)
        output_text: str = self.model.tokenizer.decode(
            output_ids[0],
            skip_special_tokens=True,
        )

        return output_text


# ------------------------------------------------------------------ #
#  Quick smoke-test when run directly
# ------------------------------------------------------------------ #
if __name__ == "__main__":
    llm = AirLLMInference(
        model_id="Qwen/Qwen2.5-7B-Instruct",
        compression="4bit",
        max_length=128,
    )

    result = llm.generate(
        prompt="What is the meaning of life?",
        max_new_tokens=50,
    )

    print("--- Generated Output ---")
    print(result)
