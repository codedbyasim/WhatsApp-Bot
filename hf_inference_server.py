# Import necessary libraries
from flask import Flask, request, jsonify
import requests
import logging
import os
import time
from dotenv import load_dotenv # Added this line

# Load environment variables from .env file
load_dotenv() # Added this line

# Initialize Flask app
app = Flask(__name__)

# Set up logging
logging.basicConfig(level=logging.INFO)

# Get Gemini API Key from environment variable
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    logging.error("GEMINI_API_KEY environment variable not set. Gemini API calls will fail.")

GEMINI_MODEL_NAME = "gemini-2.5-flash-preview-05-20" # Or gemini-1.5-flash if preferred

# Helper function for Gemini API calls with exponential backoff
def call_gemini_api(payload, retries=5, delay=1):
    api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL_NAME}:generateContent?key={GEMINI_API_KEY}"
    for i in range(retries):
        try:
            logging.info(f"Calling Gemini API (attempt {i+1}/{retries})...")
            response = requests.post(api_url, json=payload, headers={'Content-Type': 'application/json'})
            response.raise_for_status() # Raise an exception for HTTP errors
            result = response.json()
            if result.get("candidates") and result["candidates"][0].get("content") and result["candidates"][0]["content"].get("parts"):
                return result["candidates"][0]["content"]["parts"][0]["text"], 200
            else:
                logging.error(f"Unexpected Gemini API response structure: {result}")
                return "Gemini API se unexpected response mila.", 500
        except requests.exceptions.RequestException as e:
            logging.error(f"Gemini API request failed: {e}")
            if i < retries - 1:
                time.sleep(delay)
                delay *= 2 # Exponential backoff
            else:
                return f"Gemini API ko call karne mein maximum retries fail ho gaye: {e}", 500
        except Exception as e:
            logging.error(f"General error during Gemini API call: {e}")
            return f"Gemini API ko call karte hue ek anjaani galti ho gayi: {e}", 500
    return "Gemini API call attempts exhausted.", 500


# Flask routes for different LLM functionalities

@app.route('/joke', methods=['POST'])
def get_joke():
    prompt = "Generate a short, funny, and complete joke in Roman Urdu."
    payload = {"contents": [{"role": "user", "parts": [{"text": prompt}]}]}
    joke, status = call_gemini_api(payload)
    if status != 200:
        return jsonify({"error": joke}), status
    return jsonify({"joke": joke})

@app.route('/roast', methods=['POST'])
def get_roast():
    # Modified prompt to ask for just the roast without extra details
    prompt = "Generate only a short, funny, and mild roast in Roman Urdu, suitable for a friend. Do not include any explanations or translations."
    payload = {"contents": [{"role": "user", "parts": [{"text": prompt}]}]}
    roast, status = call_gemini_api(payload)
    if status != 200:
        return jsonify({"error": roast}), status
    return jsonify({"roast": roast})

@app.route('/fact', methods=['POST'])
def get_fact():
    prompt = "Generate a short, interesting, and complete fun fact in Roman Urdu."
    payload = {"contents": [{"role": "user", "parts": [{"text": prompt}]}]}
    fact, status = call_gemini_api(payload)
    if status != 200:
        return jsonify({"error": fact}), status
    return jsonify({"fact": fact})

@app.route('/analyze-mood', methods=['POST'])
def analyze_mood():
    data = request.json
    text = data.get('text', '')
    if not text:
        return jsonify({"error": "No text provided"}), 400

    prompt = f"Analyze the tone of the following conversation and classify it as funny, serious, or chill. Respond only with the classification word (e.g., 'funny', 'serious', 'chill') and then a short Roman Urdu phrase about the mood, ensuring the phrase is complete. Conversation: \"{text}\""
    payload = {"contents": [{"role": "user", "parts": [{"text": prompt}]}]}
    mood_result, status = call_gemini_api(payload)
    
    if status != 200:
        return jsonify({"error": mood_result}), status

    mood = "unknown"
    roman_urdu_phrase = ""
    parts = mood_result.split(" ", 1)
    if len(parts) > 0:
        mood = parts[0].lower().strip()
    if len(parts) > 1:
        roman_urdu_phrase = parts[1].strip()

    return jsonify({"mood": mood, "roman_urdu_phrase": roman_urdu_phrase})

@app.route('/tone-aware-reply', methods=['POST'])
def get_tone_aware_reply():
    data = request.json
    context = data.get('context', '')
    if not context:
        return jsonify({"error": "No context provided"}), 400

    prompt = f"Given the following conversation, identify its overall tone (funny, serious, or chill) and then generate a short, witty, and contextually relevant Roman Urdu reply. Ensure the reply is complete and appropriate. Conversation:\n\"{context}\"\nReply:"
    payload = {"contents": [{"role": "user", "parts": [{"text": prompt}]}]}
    reply, status = call_gemini_api(payload)
    
    if status != 200:
        return jsonify({"error": reply}), status

    # Gemini's response is generally direct, so we'll use it as is
    parsed_reply = reply.strip()
    if not parsed_reply:
        parsed_reply = "I didn't understand anything. Say it again."

    return jsonify({"reply": parsed_reply})

@app.route('/generate-reply-by-tone', methods=['POST'])
def generate_reply_by_tone():
    data = request.json
    tone = data.get('tone', 'chill') # Default tone is 'chill'
    prompt = f"Generate a short and witty Roman Urdu message with a \"{tone}\" tone. Ensure the message is complete and appropriate."
    payload = {"contents": [{"role": "user", "parts": [{"text": prompt}]}]}
    reply, status = call_gemini_api(payload)
    if status != 200:
        return jsonify({"error": reply}), status
    return jsonify({"reply": reply})

@app.route('/summarize-news', methods=['POST'])
def summarize_news():
    data = request.json
    title = data.get('title', '')
    if not title:
        return jsonify({"error": "No title provided"}), 400
    prompt = f"Summarize this news headline in Roman Urdu. Ensure the summary is concise and complete: \"{title}\""
    payload = {"contents": [{"role": "user", "parts": [{"text": prompt}]}]}
    summary, status = call_gemini_api(payload)
    if status != 200:
        return jsonify({"error": summary}), status
    return jsonify({"summary": summary})

@app.route('/quote', methods=['POST'])
def get_quote():
    data = request.json
    quote_type = data.get('type', 'motivational')
    # Modified prompt to ask for just the quote without any intro or explanation
    prompt = f"Provide only a short and complete {quote_type} quote in Roman Urdu, without any introductory phrases, explanations, or translations. Just the quote text."
    payload = {"contents": [{"role": "user", "parts": [{"text": prompt}]}]}
    quote, status = call_gemini_api(payload)
    if status != 200:
        return jsonify({"error": quote}), status
    return jsonify({"quote": quote})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
