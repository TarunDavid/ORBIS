import os
from llama_cpp import Llama
from faster_whisper import WhisperModel
import subprocess

MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'models')
SMOLLM_PATH = os.path.join(MODELS_DIR, 'smollm2-1.7b-instruct-q4_k_m.gguf')
PIPER_ONNX_PATH = os.path.join(MODELS_DIR, 'en_US-lessac-medium.onnx')

class LLMService:
    _instance = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            if not os.path.exists(SMOLLM_PATH):
                raise FileNotFoundError(f"Model not found at {SMOLLM_PATH}. Did you run download_models.py?")
            print("Loading SmolLM2 into memory...")
            cls._instance = Llama(model_path=SMOLLM_PATH, n_ctx=2048, verbose=False)
            print("SmolLM2 loaded.")
        return cls._instance

class STTService:
    _instance = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            print("Loading Whisper base model into memory...")
            # Compute type int8 for better CPU performance
            cls._instance = WhisperModel("base", device="cpu", compute_type="int8")
            print("Whisper loaded.")
        return cls._instance

class TTSService:
    @staticmethod
    def generate_audio(text, output_path):
        """
        Uses piper-tts via subprocess or command line. 
        Since we installed piper-tts python package, the 'piper' binary is in the venv path.
        """
        if not os.path.exists(PIPER_ONNX_PATH):
            raise FileNotFoundError(f"Piper model not found at {PIPER_ONNX_PATH}. Did you run download_models.py?")
        
        command = [
            "piper", 
            "--model", PIPER_ONNX_PATH, 
            "--output_file", output_path
        ]
        
        try:
            # Pass the text to piper via stdin
            process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            _, stderr = process.communicate(input=text.encode('utf-8'))
            if process.returncode != 0:
                print(f"Piper error: {stderr.decode('utf-8')}")
                return False
            return True
        except Exception as e:
            print(f"Failed to run piper: {e}")
            return False
