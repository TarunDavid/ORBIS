import os
import subprocess

MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'models')
QWEN_PATH = os.path.join(MODELS_DIR, 'qwen2.5-1.5b-instruct-q4_k_m.gguf')
PIPER_ONNX_PATH = os.path.join(MODELS_DIR, 'en_US-lessac-medium.onnx')


import threading

class LLMService:
    """Singleton service for Qwen2.5 1.5B local inference via llama.cpp."""
    _instance = None
    _lock = threading.Lock()

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            try:
                from llama_cpp import Llama
            except ImportError:
                raise ImportError(
                    "llama-cpp-python is not installed. "
                    "Install it with: pip install llama-cpp-python"
                )

            if not os.path.exists(QWEN_PATH):
                raise FileNotFoundError(
                    f"Qwen2.5 model not found at {QWEN_PATH}. "
                    f"Run: python download_models.py"
                )
            import platform
            n_gpu = -1 if platform.system() == 'Darwin' else 0
            cpu_threads = max(4, min(8, os.cpu_count() or 4))
            print(f"Loading Qwen2.5 1.5B into memory (n_gpu_layers={n_gpu}, n_ctx=8192)...")
            cls._instance = Llama(
                model_path=QWEN_PATH,
                n_gpu_layers=n_gpu,
                n_ctx=8192,
                n_batch=512,
                n_threads=cpu_threads,
                n_threads_batch=cpu_threads,
                verbose=False,
            )
            print("Qwen2.5 loaded with GPU/hardware acceleration.")
        return cls._instance

    @classmethod
    def generate(cls, prompt, **kwargs):
        """Thread-safe generation."""
        with cls._lock:
            llm = cls.get_instance()
            return llm(prompt, **kwargs)

    @classmethod
    def chat(cls, messages, **kwargs):
        """Thread-safe chat completion using Qwen's native chat template."""
        with cls._lock:
            llm = cls.get_instance()
            return llm.create_chat_completion(messages=messages, **kwargs)

    @classmethod
    def generate_json(cls, messages, max_tokens=2048, retries=1):
        """
        Generate structured JSON output using create_chat_completion.
        Retries up to `retries` times if JSON parsing fails.
        """
        import json
        llm = cls.get_instance()
        
        for attempt in range(retries + 1):
            with cls._lock:
                output = llm.create_chat_completion(
                    messages=messages,
                    response_format={"type": "json_object"},
                    max_tokens=max_tokens,
                )
            
            try:
                content = output['choices'][0]['message']['content'].strip()
                parsed_json = json.loads(content)
                return parsed_json
            except (json.JSONDecodeError, KeyError, IndexError) as e:
                if attempt == retries:
                    raise ValueError(f"Failed to generate valid JSON after {retries + 1} attempts. Last error: {e}")
                print(f"JSON generation failed, retrying... (Attempt {attempt + 1}/{retries + 1})")
        
        return None


class STTService:
    """Singleton service for Whisper speech-to-text (Tarun owns implementation)."""
    _instance = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            try:
                from faster_whisper import WhisperModel
            except ImportError:
                raise ImportError(
                    "faster-whisper is not installed. "
                    "Install it with: pip install faster-whisper"
                )
            print("Loading Whisper base model into memory...")
            # Compute type int8 for better CPU performance
            cls._instance = WhisperModel("base", device="cpu", compute_type="int8")
            print("Whisper loaded.")
        return cls._instance


class TTSService:
    """Piper text-to-speech via subprocess (Tarun owns implementation)."""
    @staticmethod
    def generate_audio(text, output_path):
        """
        Uses piper-tts via subprocess or command line.
        Since we installed piper-tts python package, the 'piper' binary is in the venv path.
        """
        if not os.path.exists(PIPER_ONNX_PATH):
            raise FileNotFoundError(
                f"Piper model not found at {PIPER_ONNX_PATH}. "
                f"Run: python download_models.py"
            )

        import sys
        import shutil
        piper_bin = (
            shutil.which('piper')
            or os.path.join(os.path.dirname(sys.executable), 'Scripts', 'piper.exe')
            or os.path.join(os.path.dirname(sys.executable), 'piper')
        )
        command = [
            piper_bin,
            "--model", PIPER_ONNX_PATH,
            "--output_file", output_path
        ]

        try:
            # Pass the text to piper via stdin
            process = subprocess.Popen(
                command, stdin=subprocess.PIPE,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE
            )
            _, stderr = process.communicate(input=text.encode('utf-8'))
            if process.returncode != 0:
                print(f"Piper error: {stderr.decode('utf-8')}")
                return False
            return True
        except Exception as e:
            print(f"Failed to run piper: {e}")
            return False
