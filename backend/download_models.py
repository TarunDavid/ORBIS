import os
import urllib.request
import ssl
from huggingface_hub import hf_hub_download

# Bypass SSL verification on Mac
ssl._create_default_https_context = ssl._create_unverified_context

MODELS_DIR = os.path.join(os.path.dirname(__file__), 'models')
os.makedirs(MODELS_DIR, exist_ok=True)

def download_smollm():
    print("Downloading SmolLM2 1.7B GGUF...")
    # SmolLM2 1.7B Instruct Q4_K_M GGUF
    repo_id = "HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF"
    filename = "smollm2-1.7b-instruct-q4_k_m.gguf"
    model_path = hf_hub_download(repo_id=repo_id, filename=filename, local_dir=MODELS_DIR)
    print(f"SmolLM downloaded to: {model_path}")
    return model_path

def download_piper_voice():
    print("Downloading Piper English US voice...")
    voice_name = "en_US-lessac-medium"
    voice_url = f"https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/{voice_name}.onnx"
    json_url = f"{voice_url}.json"
    
    onnx_path = os.path.join(MODELS_DIR, f"{voice_name}.onnx")
    json_path = os.path.join(MODELS_DIR, f"{voice_name}.onnx.json")
    
    if not os.path.exists(onnx_path):
        urllib.request.urlretrieve(voice_url, onnx_path)
    if not os.path.exists(json_path):
        urllib.request.urlretrieve(json_url, json_path)
        
    print(f"Piper voice downloaded to: {onnx_path}")

def run():
    download_smollm()
    download_piper_voice()
    print("All models downloaded successfully!")
    print("Note: faster-whisper will automatically download its model on first run.")

if __name__ == '__main__':
    run()
