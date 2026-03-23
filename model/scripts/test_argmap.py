"""Quick test to see what phi4 and llama3.1 return for argument_map."""
import requests, json

PROMPT = """You are a rhetorical analyst. Return ONLY valid JSON with this exact schema:
{"detections":[{"technique":"Name","snippet":"exact quote","explanation":"why","confidence":"high","trigger_phrases":["p1"],"argument_map":{"conclusion":"what is being argued","premises":[{"text":"evidence offered","type":"irrelevant","issue":"why problematic"}],"logical_gaps":["gap description"],"missing_evidence":["what would be needed"],"steelman":"Rewrite the argument directly. Do NOT describe changes - write the actual improved text as if you were the author making the same point honestly."}}],"overall_assessment":"summary"}"""

TEXT = "You can't trust the senator's policy proposals. He was caught cheating on his taxes three years ago."

for model in ["phi4", "llama3.1:8b"]:
    print(f"\n{'='*60}")
    print(f"MODEL: {model}")
    print('='*60)
    r = requests.post("http://localhost:11434/api/chat", json={
        "model": model,
        "messages": [
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": f"Analyze this text: {TEXT}"},
        ],
        "stream": False,
        "format": "json",
        "options": {"num_ctx": 8192},
    }, timeout=120)
    c = r.json().get("message", {}).get("content", "")
    try:
        p = json.loads(c)
        print(json.dumps(p, indent=2)[:1500])
    except:
        print("PARSE ERROR:", c[:500])
