# 🌟 Tone-Aware WhatsApp Bot 🤖

A **sophisticated WhatsApp bot** designed to enhance group interactions and automate tasks.  
It features **tone-aware replies**, **Roman Urdu language generation**, **group management commands**, and integrates a **Python Flask server** for advanced Large Language Model (LLM) capabilities using **Google’s Gemini API**.

---

## ✨ Features

### 🎭 Tone & Fun  

✔ Tone-aware replies (funny, chill, serious) in Roman Urdu  
✔ `!joke` → Sends a short joke  
✔ `!fact` → Provides an interesting fact  
✔ `!roast @user` → Light-hearted roast for a tagged user  
✔ `!quote` → Motivational or funny quote  

### 👥 Group Management  

✔ `!tagall` or `!tag [message]` → Tags all group members  
✔ `!spam [@user] "<message>" <count>` → Sends a message multiple times (max 20)  
✔ `Stop @[BotName]` → Stops spam (only by initiator)  

### 🛠 Utilities  

✔ `!mood` → Analyzes recent group messages & reports mood  
✔ `!news` → Fetches & summarizes today’s top 5 news (Roman Urdu, News API key required)  
✔ `!help` → Shows available commands  

### 🌸 Auto Reactions  

* Replies with 🌸 to "Good morning" and "Good night"  
* Detects spam & roasts the sender  

---

## 🏗️ Architecture  

**Hybrid setup:**  

* **Node.js (main.js):** Handles WhatsApp communication, commands, and orchestrates requests  
* **Python (hf_inference_server.py):** Runs a Flask server connected to **Google Gemini API** for LLM-powered tasks  

---

## 🚀 Quick Start  

### 1. Clone Repository  

```bash
git clone https://github.com/codedbyasim/WhatsApp-Bot
cd WhatsApp-Bot
```

### 2. Install Dependencies  

**Node.js:**  

```bash
npm install
```

**Python:**  

```bash
pip install Flask requests python-dotenv
```

### 3. Configure Environment Variables  

Create a file named `.env` in the project root:  

```ini
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY_PATH=
FIREBASE_STORAGE_BUCKET=

BOT_ID="1234567874@s.whatsapp.net"  

# Authorized WhatsApp IDs
REHAN_ID=69510287589385@lid  
SAAD_ID=12345678902@s.whatsapp.net  
ASIM_ID=1234567878@s.whatsapp.net  

# Target group/contact JID
CODE_ON_REMOTEJ_ID=120363403535865809@g.us  

# Servers & APIs
PYTHON_INFERENCE_URL=http://localhost:5000  
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"  
NEWS_API_KEY="YOUR_NEWS_API_KEY"  
```

---

## 🏃 Running the Bot  

### Start Python Server  

```bash
python hf_inference_server.py
```

(Starts Flask server on `http://localhost:5000`)  

### Start Node.js Bot  

```bash
node main.js
```

Scan the QR code in your terminal using **WhatsApp > Linked Devices**.  
If successful, you’ll see:  

```
WhatsApp connection opened successfully!
```

---

## 💬 Example Usage  

* `!help`  
* `!joke`  
* `!roast @SomeUser`  
* `!tagall "Meeting in 5 minutes!"`  
* `Good morning` → 🌸  

---

## 🛠 Troubleshooting  

❌ **Unauthorized to use this command**  
→ Ensure your WhatsApp ID is in `.env` under allowed users  

❌ **Gemini API key is None**  
→ Check `.env` and restart `hf_inference_server.py`  

❌ **Bot looping on "Good morning"**  
→ Update to latest `main.js` (bot ignores its own messages)  

---

## 🤝 Contributing  

Want to improve this bot? Fork the repo and submit a PR!  
Some ideas for contributions:  

* Add new fun commands (`!riddle`, `!shayari`)  
* Add tone categories (angry, sarcastic, polite)  
* Improve group management features  

---

## 📄 License  

This project is licensed under the **ISC License**.  
