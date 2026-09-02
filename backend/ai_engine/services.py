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
            print("Loading Qwen2.5 1.5B into memory...")
            cls._instance = Llama(
                model_path=QWEN_PATH,
                n_ctx=4096,  # Qwen2.5 supports larger context
                verbose=True,
            )
            print("Qwen2.5 loaded.")
        return cls._instance

    @classmethod
    def generate(cls, prompt, **kwargs):
        """Thread-safe generation."""
        with cls._lock:
            llm = cls.get_instance()
            return llm(prompt, **kwargs)


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

        command = [
            "piper",
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
