import os
import urllib.request

MODELS_DIR = os.path.join("public", "models")
os.makedirs(MODELS_DIR, exist_ok=True)

BASE_URL = "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/"

MODELS_TO_DOWNLOAD = [
    "tiny_face_detector_model-weights_manifest.json",
    "tiny_face_detector_model-shard1",
    "face_landmark_68_model-weights_manifest.json",
    "face_landmark_68_model-shard1",
    "face_expression_model-weights_manifest.json",
    "face_expression_model-shard1",
]

for filename in MODELS_TO_DOWNLOAD:
    file_path = os.path.join(MODELS_DIR, filename)
    if not os.path.exists(file_path):
        print(f"Downloading {filename}...")
        url = BASE_URL + filename
        try:
            urllib.request.urlretrieve(url, file_path)
            print(f"Downloaded {filename} successfully.")
        except Exception as e:
            print(f"Failed to download {filename}: {e}")
    else:
        print(f"{filename} already exists.")
