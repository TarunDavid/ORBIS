import os
from llama_cpp import Llama

def test():
    models_dir = os.path.join(os.path.dirname(__file__), 'models')
    qwen_path = os.path.join(models_dir, 'qwen2.5-1.5b-instruct-q4_k_m.gguf')
    
    print("Loading model...")
    llm = Llama(
        model_path=qwen_path,
        n_ctx=2048,
        verbose=True,
    )
    print("Loaded. Generating...")
    output = llm("Hello, how are you?", max_tokens=50)
    print(output)
    print("Done!")

if __name__ == "__main__":
    test()
