import os
import urllib.request
import ssl

ssl._create_default_https_context = ssl._create_unverified_context

MEDIA_DIR = os.path.join(os.path.dirname(__file__), 'media', 'grade5', 'science', 'ch1')
os.makedirs(MEDIA_DIR, exist_ok=True)

def download_file(url, path):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response, open(path, 'wb') as out_file:
        out_file.write(response.read())

def download_sample_media():
    print("Downloading sample video...")
    video_url = "https://www.w3schools.com/html/mov_bbb.mp4"
    video_path = os.path.join(MEDIA_DIR, "video.mp4")
    if not os.path.exists(video_path):
        download_file(video_url, video_path)
    
    print("Downloading sample PDF...")
    pdf_url = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
    pdf_path = os.path.join(MEDIA_DIR, "notes.pdf")
    if not os.path.exists(pdf_path):
        download_file(pdf_url, pdf_path)
        
    print("Local media downloaded successfully to backend/media!")

if __name__ == '__main__':
    download_sample_media()
