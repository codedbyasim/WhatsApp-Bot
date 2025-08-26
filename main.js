// Import necessary modules
const makeWASocket = require("@whiskeysockets/baileys").default;
const { DisconnectReason, useMultiFileAuthState, getUrlInfo, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
// The firebase.js module is still imported, but its functions are now placeholders.
// We'll keep the import for now, but remove direct calls to its storage functions.
const { uploadFolder, downloadFolder, initializeFirebase } = require("./firebase.js"); 
const axios = require("axios");
const nodeCron = require("node-cron");
const { useMongoDBAuthState } = require("./mongoAuthState.js"); // Assuming mongoAuthState.js is in the same directory
// HuggingFace Inference will no longer be used directly in Node.js
// const { HfInference } = require("@huggingface/inference");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const { MongoClient } = require("mongodb");

// HuggingFace Inference will no longer run directly in Node.js.
// URL for the Python server
const PYTHON_INFERENCE_URL = process.env.PYTHON_INFERENCE_URL || "http://localhost:5000";

// Express app setup
const app = express();
const port = process.env.PORT || 3000;

// Global variables for bot state
let sock;
let stopSpam = false;
let spamInitiatorId = null;
const messageHistory = new Map(); // Stores message history for tone detection { jid: [{ message, timestamp }] }
const SPAM_THRESHOLD_TIME_MS = 5000; // 5 seconds
const SPAM_THRESHOLD_COUNT = 5; // 5 messages in 5 seconds
const MAX_MESSAGE_HISTORY = 20; // Keep last 20 messages for tone analysis

// Authorized participants from .env
const authorizedParticipants = [
  process.env.REHAN_ID,
  process.env.SAAD_ID,
  process.env.FAHAD_ID,
  process.env.NOMAN_ID,
  process.env.ALI_ID,
  process.env.ASIM_ID, // Your bot's ID
  process.env.ZAIN_ID,
];

// Local folder for Baileys auth state
const localFolderPath = path.normalize(
  path.join(__dirname, "auth_info_baileys")
);

// MongoDB setup (optional)
const mongoURL = process.env.MONGO_URL;
let mongoClient;
let authCollection;

/**
 * Delays execution for a specified number of milliseconds.
 * @param {number} ms - The number of milliseconds to delay.
 * @returns {Promise<void>} A promise that resolves after the delay.
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Initializes bot storage (now only MongoDB if configured, otherwise relies on local files).
 * Firebase Storage calls removed.
 * @returns {Promise<void>}
 */
async function initializeBotStorage() {
  try {
    // Firebase initialization and download calls removed
    // as Storage feature is no longer used.

    // Set up MongoDB auth state if MONGO_URL is provided
    if (mongoURL) {
      console.log("MongoDB URL provided, attempting to connect to MongoDB...");
      mongoClient = new MongoClient(mongoURL);
      await mongoClient.connect();
      authCollection = mongoClient.db("whatsappbot").collection("auth");
      console.log("Connected to MongoDB for auth state.");
    } else {
      console.log("MongoDB URL not provided. Using local file system for auth state.");
      // Ensure local auth folder exists if using multi-file auth state
      if (!fs.existsSync(localFolderPath)) {
        fs.mkdirSync(localFolderPath, { recursive: true });
        console.log("Created local auth folder:", localFolderPath);
      }
    }

  } catch (error) {
    console.error("Error during bot storage initialization:", error);
    process.exit(1); // Exit if storage cannot be initialized
  }
}

/**
 * Connects to WhatsApp using Baileys.
 */
async function connectToWhatsApp() {
  await initializeBotStorage(); // Initialize storage (now without Firebase)

  const { state, saveCreds } = mongoURL
    ? await useMongoDBAuthState(authCollection)
    : await useMultiFileAuthState(localFolderPath);

  sock = makeWASocket({
    printQRInTerminal: true,
    auth: state,
    keepAliveIntervalMs: 20000,
    defaultQueryTimeoutMs: 0,
    generateHighQualityLinkPreview: true,
    browser: ["ToneAwareBot", "Safari", "1.0"] // Custom browser name
  });

  // Event listener for connection updates
  sock.ev.on("connection.update", (update) => handleConnectionUpdate(update, sock, saveCreds));
  // Event listener for credentials updates
  sock.ev.on("creds.update", async () => {
    await saveCreds();
    // Firebase upload call for credentials removed, as Storage is not used.
  });
  // Event listener for incoming messages
  sock.ev.on("messages.upsert", async (messageUpdate) => handleMessagesUpsert(messageUpdate, sock));

  console.log("WhatsApp bot starting...");
}

/**
 * Handles WhatsApp connection updates.
 * @param {object} update - The connection update object.
 * @param {object} sock - The Baileys socket object.
 * @param {function} saveCreds - Function to save credentials.
 */
async function handleConnectionUpdate(update, sock, saveCreds) {
  const { connection, lastDisconnect, qr } = update || {};

  if (qr) {
    console.log("Scan this QR code:", qr);
    const QRCode = require("qrcode-terminal");
    QRCode.generate(qr, { small: true });
  }

  if (connection === "close") {
    const shouldReconnect =
      lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

    console.log("Connection closed due to:", lastDisconnect?.error, ", reconnecting:", shouldReconnect);
    if (shouldReconnect) {
      await connectToWhatsApp();
    }
  } else if (connection === "open") {
    console.log("WhatsApp connection opened successfully!");
    // Schedule cron jobs once connection is open
    scheduleCronJobs(sock);
  }
}

/**
 * Schedules daily cron jobs for news and quotes.
 * @param {object} sock - The Baileys socket object.
 */
function scheduleCronJobs(sock) {
  // Schedule daily news at 11:00 AM IST
  nodeCron.schedule("0 11 * * *", async () => {
    console.log("Cron job triggered for daily news!");
    if (sock.ws?.readyState === sock.ws.OPEN) {
      try {
        await sendDailyNews(sock, process.env.CODE_ON_REMOTEJ_ID);
      } catch (sendError) {
        console.error("Error sending daily news via cron:", sendError);
      }
    } else {
      console.error("Socket not open. Unable to send daily news.");
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });

  // Schedule daily quote at 9:00 AM IST
  nodeCron.schedule("0 9 * * *", async () => {
    console.log("Cron job triggered for daily quote!");
    if (sock.ws?.readyState === sock.ws.OPEN) {
      try {
        await sendRandomQuote(sock, process.env.CODE_ON_REMOTEJ_ID);
      } catch (sendError) {
        console.error("Error sending daily quote via cron:", sendError);
      }
    } else {
      console.error("Socket not open. Unable to send daily quote.");
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });

  console.log("Cron jobs scheduled for daily news (11 AM) and quotes (9 AM).");
}

/**
 * Handles incoming WhatsApp messages.
 * @param {object} messageUpdate - The message update object.
 * @param {object} sock - The Baileys socket object.
 */
async function handleMessagesUpsert(messageUpdate, sock) {
  try {
    const messageZero = messageUpdate.messages[0];
    const { key, message } = messageZero;
    if (!message) return;

    const { remoteJid, participant, fromMe } = key;
    const messageText = message.conversation || message.extendedTextMessage?.text || message.imageMessage?.caption || message.videoMessage?.caption;

    if (!messageText) {
      return;
    }

    // IMPORTANT: Ignore messages from the bot itself to prevent infinite loops
    if (fromMe) {
      return;
    }

    const senderJid = participant || remoteJid; // For private chats, remoteJid is the sender
    const isGroup = remoteJid.endsWith("@g.us");
    const myPhone = sock.user.id.split(":")[0];
    const myId = `${myPhone}@s.whatsapp.net`;
    const mentions = message.extendedTextMessage?.contextInfo?.mentionedJid || [];

    // Store message in history for tone detection
    updateMessageHistory(remoteJid, { sender: senderJid, text: messageText, timestamp: Date.now() });

    // --- Authorization Check ---
    // If it's a private chat, any message from an authorized participant is allowed.
    // If it's a group, only authorized participants can trigger commands.
    // Bot's own messages are always allowed.
    const isAuthorized = authorizedParticipants.includes(senderJid) || fromMe;
    if (!isAuthorized && !isGroup) {
      // If not authorized in a private chat, ignore or send a generic message
      console.log(`Unauthorized private chat from: ${senderJid}`);
      // await sock.sendMessage(remoteJid, { text: "You are not authorized to use this bot." });
      return;
    } else if (!isAuthorized && isGroup && messageText.startsWith("!")) {
      // If not authorized in a group and trying to use a command, warn them
      console.log(`Unauthorized command attempt by ${senderJid} in group ${remoteJid}`);
      await sock.sendMessage(remoteJid, { text: "You are not authorized to use this command." });
      return;
    }


    // --- Spam Detection ---
    if (isGroup && !fromMe) { // Only detect spam in groups and from other participants
      if (checkSpam(remoteJid, senderJid, messageText)) {
        await sendToneAwareReply(sock, remoteJid, "roast", `Hey there, slow down a bit! What's the rush? Your keyboard will get hot. 😂 (${senderJid})`);
        // Consider temporarily blocking the user from sending more messages or other actions
        return; // Stop processing further commands from this message
      }
    }


    // --- Stop Spam Command ---
    if (messageText.toLowerCase().includes("stop") && mentions.includes(myId)) {
      if (!spamInitiatorId) {
        await sock.sendMessage(remoteJid, { text: "No spam is running, what to stop?" });
        return;
      }
      if (spamInitiatorId === senderJid) {
        stopSpam = true; // Set flag to stop spamming
        await sock.sendMessage(remoteJid, { text: "Okay, spam has been stopped." });
        console.log("Spam stopped by initiator.");
      } else {
        await sock.sendMessage(remoteJid, { text: `Only the person who started the spam can stop it. Initiator: @${spamInitiatorId.split('@')[0]}`, mentions: [spamInitiatorId] });
        console.log("Only the spam initiator can stop the spam.");
      }
      return;
    }

    // --- Command Handling ---
    if (messageText.startsWith("!")) {
      const command = messageText.split(" ")[0].toLowerCase();
      const args = messageText.substring(command.length).trim();

      switch (command) {
        case "!joke":
          await sendRomanUrduJoke(sock, remoteJid);
          break;
        case "!roast":
          await handleRoastCommand(sock, remoteJid, messageZero);
          break;
        case "!fact":
          await sendRomanUrduFact(sock, remoteJid);
          break;
        case "!mood":
          await sendGroupMood(sock, remoteJid);
          break;
        case "!tagall":
        case "!tag": // Added !tag as an alias for !tagall
          await tagAllMembers(remoteJid, sock, messageZero);
          break;
        case "!news":
          await sendDailyNews(sock, remoteJid);
          break;
        case "!quote":
          await sendRandomQuote(sock, remoteJid);
          break;
        case "!spam":
          await handleSpamCommand(sock, remoteJid, messageZero, args);
          break;
        case "!help":
          await sendHelpMessage(sock, remoteJid);
          break;
        default:
          await sendToneAwareReply(sock, remoteJid, "chill", "Didn't understand what you're saying. Type !help to check commands.");
          break;
      }
    } else {
      // --- General Message Handling & Tone-Aware Replies ---
      // React to specific phrases (existing feature from user's `index.js`)
      if (messageText.toLowerCase().includes("good morning")) {
        await sock.sendMessage(remoteJid, { text: "🌸 Good Morning!" });
      } else if (messageText.toLowerCase().includes("good night")) {
        await sock.sendMessage(remoteJid, { text: "🌸 Good Night!" });
      }

      // If bot is mentioned or in a private chat, generate a tone-aware reply
      if (mentions.includes(myId) || !isGroup) {
        await generateAndSendToneAwareReply(sock, remoteJid, messageText);
      }

      // Preview links (existing feature from user's `index.js` implied by link-preview-js dependency)
      // Baileys automatically generates link previews if generateHighQualityLinkPreview is true.
      // If a specific link preview behavior is needed, it would be implemented here
      // using getUrlInfo and sendMessage with { text, linkPreview }.
    }

  } catch (error) {
    console.error("Error in handleMessagesUpsert:", error);
  }
}

/**
 * Updates the message history for a given JID.
 * @param {string} jid - The JID of the chat.
 * @param {object} messageData - The message object { sender, text, timestamp }.
 */
function updateMessageHistory(jid, messageData) {
  if (!messageHistory.has(jid)) {
    messageHistory.set(jid, []);
  }
  const history = messageHistory.get(jid);
  history.push(messageData);
  if (history.length > MAX_MESSAGE_HISTORY) {
    history.shift(); // Remove the oldest message
  }
}

/**
 * Checks for spam based on message frequency from a user in a chat.
 * @param {string} jid - The JID of the chat.
 * @param {string} senderJid - The JID of the sender.
 * @param {string} messageText - The message text.
 * @returns {boolean} True if spam is detected, false otherwise.
 */
function checkSpam(jid, senderJid, messageText) {
  if (!messageHistory.has(jid)) return false;

  const history = messageHistory.get(jid).filter(msg => msg.sender === senderJid);
  const now = Date.now();

  const recentMessages = history.filter(msg => now - msg.timestamp < SPAM_THRESHOLD_TIME_MS);

  if (recentMessages.length >= SPAM_THRESHOLD_COUNT) {
    console.log(`Spam detected from ${senderJid} in ${jid}`);
    return true;
  }
  return false;
}

/**
 * Analyzes message history to determine the group's current mood.
 * @param {string} jid - The JID of the chat.
 * @returns {Promise<string>} The detected mood in Roman Urdu.
 */
async function analyzeGroupMood(jid) {
  if (!messageHistory.has(jid) || messageHistory.get(jid).length === 0) {
    return "No khaas conversation yet, so can't determine the mood.";
  }

  const recentTexts = messageHistory.get(jid).map(msg => msg.text).join(" ");
  try {
    const response = await axios.post(`${PYTHON_INFERENCE_URL}/analyze-mood`, {
      text: recentTexts
    });
    const { mood, roman_urdu_phrase } = response.data;

    if (mood.includes("funny") || mood.includes("roasting")) {
      return `The group's mood seems quite "funny". ${roman_urdu_phrase || "Everyone is engaged in humor!"}`;
    } else if (mood.includes("chill") || mood.includes("casual")) {
      return `The group's mood seems "chill". ${roman_urdu_phrase || "Everyone is fine and relaxed."}`;
    } else if (mood.includes("serious") || mood.includes("emotional")) {
      return `The group's mood seems a bit "serious". ${roman_urdu_phrase || "Some deep conversations are happening."}`;
    } else {
      return `I can't understand the group's mood. ${roman_urdu_phrase || "Perhaps everyone is quiet or there are mixed feelings."}`;
    }
  } catch (error) {
    console.error("Error analyzing group mood with HuggingFace:", error);
    return "Can't analyze the mood, maybe I'm also confused.";
  }
}

/**
 * Generates a Roman Urdu response based on detected tone and previous messages.
 * @param {object} sock - The Baileys socket object.
 * @param {string} jid - The JID to send the message to.
 * @param {string} latestMessage - The latest message received.
 * @returns {Promise<void>}
 */
async function generateAndSendToneAwareReply(sock, jid, latestMessage) {
  const history = messageHistory.has(jid) ? messageHistory.get(jid).map(msg => msg.text) : [];
  const conversationContext = [...history, latestMessage].slice(-10).join("\n"); // Last 10 messages for context

  try {
    const response = await axios.post(`${PYTHON_INFERENCE_URL}/tone-aware-reply`, {
      context: conversationContext
    });
    const { reply } = response.data;

    await sock.sendMessage(jid, { text: reply });

  } catch (error) {
    console.error("Error generating tone-aware reply with HuggingFace:", error);
    await sock.sendMessage(jid, { text: "Sorry, I can't reply right now. Something went wrong." });
  }
}

/**
 * Sends a tone-aware reply based on a predefined tone.
 * @param {object} sock - The Baileys socket object.
 * @param {string} jid - The JID to send the message to.
 * @param {string} tone - The desired tone ('funny', 'serious', 'chill', 'roast').
 * @param {string} [customMessage] - A custom message to use instead of generating.
 */
async function sendToneAwareReply(sock, jid, tone, customMessage = "") {
  let replyText = "";

  if (customMessage) {
    replyText = customMessage;
  } else {
    try {
      const response = await axios.post(`${PYTHON_INFERENCE_URL}/generate-reply-by-tone`, {
        tone: tone
      });
      replyText = response.data.reply;
      if (!replyText) {
          replyText = `Wanted to say something ${tone}, but can't find the words.`;
      }
    } catch (error) {
      console.error(`Error generating ${tone} reply:`, error);
      replyText = `Sorry, can't generate a ${tone} reply.`;
    }
  }
  await sock.sendMessage(jid, { text: replyText });
}


// --- Command Implementations ---

/**
 * Sends a random Roman Urdu joke.
 * @param {object} sock - The Baileys socket object.
 * @param {string} jid - The JID to send the message to.
 */
async function sendRomanUrduJoke(sock, jid) {
  try {
    const response = await axios.post(`${PYTHON_INFERENCE_URL}/joke`);
    const joke = response.data.joke;
    await sock.sendMessage(jid, { text: `😂: ${joke || "I can't remember any joke right now."}` });
  }
  catch (error) {
    console.error("Error generating Roman Urdu joke:", error);
    await sock.sendMessage(jid, { text: "Can't generate a joke, maybe my sense of humor is offline." });
  }
}

/**
 * Handles the !roast command.
 * @param {object} sock - The Baileys socket object.
 * @param {string} remoteJid - The JID of the chat.
 * @param {object} messageZero - The message object.
 */
async function handleRoastCommand(sock, remoteJid, messageZero) {
  const mentions = messageZero.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (mentions.length > 0) {
    const targetJid = mentions[0];
    try {
      const response = await axios.post(`${PYTHON_INFERENCE_URL}/roast`);
      const roast = response.data.roast;
      await sock.sendMessage(remoteJid, {
        text: `Oh bhai, @${targetJid.split('@')[0]}! ${roast || "It seems no roast can be made on you!"} 🔥`,
        mentions: [targetJid]
      });
    } catch (error) {
      console.error("Error roasting in Roman Urdu:", error);
      await sock.sendMessage(remoteJid, { text: "Can't roast, maybe the target is too good for one." });
    }
  } else {
    await sock.sendMessage(remoteJid, { text: "Whom to roast? Tag them! (!roast @user)" });
  }
}

/**
 * Sends a random Roman Urdu fun fact.
 * @param {object} sock - The Baileys socket object.
 * @param {string} jid - The JID to send the message to.
 */
async function sendRomanUrduFact(sock, jid) {
  try {
    const response = await axios.post(`${PYTHON_INFERENCE_URL}/fact`);
    const fact = response.data.fact;
    await sock.sendMessage(jid, { text: `🧠 Did you know? ${fact || "I can't remember any fact right now."}` });
  } catch (error) {
    console.error("Error generating Roman Urdu fact:", error);
    await sock.sendMessage(jid, { text: "Can't generate a fact, maybe facts are also on vacation these days." });
  }
}

/**
 * Sends the current group mood.
 * @param {object} sock - The Baileys socket object.
 * @param {string} jid - The JID of the chat.
 */
async function sendGroupMood(sock, jid) {
  if (!jid.endsWith("@g.us")) {
    await sock.sendMessage(jid, { text: "This command only works in groups." });
    return;
  }
  const mood = await analyzeGroupMood(jid);
  await sock.sendMessage(jid, { text: `Current mood: ${mood}` });
}

/**
 * Tags all members in a group.
 * @param {string} remoteJid - The JID of the group.
 * @param {object} sock - The Baileys socket object.
 * @param {object} messageZero - The message object.
 */
async function tagAllMembers(remoteJid, sock, messageZero) {
  if (!remoteJid.endsWith("@g.us")) {
    await sock.sendMessage(remoteJid, { text: "This command only works in groups." });
    return;
  }

  try {
    const groupMetadata = await sock.groupMetadata(remoteJid);
    const participants = groupMetadata.participants;
    const myId = `${sock.user.id.split(":")[0]}@s.whatsapp.net`;

    const filteredParticipants = participants.filter(p => p.id !== myId); // Exclude the bot itself
    const mentionIds = filteredParticipants.map(p => p.id);
    const mentionText = filteredParticipants.map(p => `@${p.id.split('@')[0]}`).join(" ");

    const customMessage = messageZero.message?.extendedTextMessage?.text?.replace(/!tagall|!tag/i, '').trim();

    await sock.sendMessage(remoteJid, {
      text: customMessage || "Time to wake everyone up!",
      mentions: mentionIds,
    });
  } catch (error) {
    console.error("Error tagging all members:", error);
    await sock.sendMessage(remoteJid, { text: "Couldn't tag everyone, something went wrong." });
  }
}

/**
 * Sends daily news headlines.
 * @param {object} sock - The Baileys socket object.
 * @param {string} jid - The JID to send the message to.
 */
async function sendDailyNews(sock, jid) {
  const NEWS_API_KEY = process.env.NEWS_API_KEY;
  if (!NEWS_API_KEY) {
    await sock.sendMessage(jid, { text: "News API key is not configured." });
    return;
  }

  try {
    const response = await axios.get(`https://newsapi.org/v2/top-headlines?country=in&apiKey=${NEWS_API_KEY}`);
    const articles = response.data.articles.slice(0, 5); // Get top 5 headlines

    if (articles.length === 0) {
      await sock.sendMessage(jid, { text: "Couldn't find any news for today." });
      return;
    }

    let newsMessage = "📰 *Today's Top Headlines (in Roman Urdu):*\n\n";
    for (const [index, article] of articles.entries()) {
      // Use Python server to translate/summarize in Roman Urdu
      const summaryResponse = await axios.post(`${PYTHON_INFERENCE_URL}/summarize-news`, {
        title: article.title
      });
      const romanUrduHeadline = summaryResponse.data.summary;

      newsMessage += `${index + 1}. *${romanUrduHeadline || article.title}*\n`;
      newsMessage += `   _Source: ${article.source.name}_\n`;
      newsMessage += `   Link: ${article.url}\n\n`;
    }

    await sock.sendMessage(jid, { text: newsMessage });
  } catch (error) {
    console.error("Error fetching or sending daily news:", error);
    await sock.sendMessage(jid, { text: "Something went wrong while fetching news." });
  }
}

/**
 * Sends a random motivational/funny quote.
 * @param {object} sock - The Baileys socket object.
 * @param {string} jid - The JID to send the message to.
 */
async function sendRandomQuote(sock, jid) {
  try {
    const quoteType = Math.random() < 0.5 ? "motivational" : "funny";
    const response = await axios.post(`${PYTHON_INFERENCE_URL}/quote`, {
      type: quoteType
    });
    const quote = response.data.quote;
    // Modified to send ONLY the quote, as requested
    await sock.sendMessage(jid, { text: `${quote || "No quote found today."}` }); 
  } catch (error) {
    console.error("Error generating random quote:", error);
    await sock.sendMessage(jid, { text: "Can't generate a quote, maybe I ran out of words today." });
  }
}

/**
 * Handles the !spam command.
 * @param {object} sock - The Baileys socket object.
 * @param {string} remoteJid - The JID of the chat.
 * @param {object} messageZero - The message object.
 * @param {string} args - The arguments for the spam command.
 */
async function handleSpamCommand(sock, remoteJid, messageZero, args) {
  if (!remoteJid.endsWith("@g.us")) {
    await sock.sendMessage(remoteJid, { text: "This command only works in groups." });
    return;
  }

  const matches = args.match(/(?:@(\d+)\s+)?\"([^\"]+)\"\s+(\d+)/);
  if (!matches) {
    await sock.sendMessage(remoteJid, { text: "Spam command format is incorrect. Correct format: !spam [@user] \"<message>\" <count>" });
    return;
  }

  const targetPhoneNumber = matches[1]; // Optional: User to mention
  const spamText = matches[2];
  const spamCount = parseInt(matches[3]);

  if (isNaN(spamCount) || spamCount <= 0 || spamCount > 20) {
    await sock.sendMessage(remoteJid, { text: "Spam count should be between 1 and 20." });
    return;
  }

  let mentions = [];
  if (targetPhoneNumber) {
    mentions.push(`${targetPhoneNumber}@s.whatsapp.net`);
  }

  spamInitiatorId = messageZero.key.participant;
  stopSpam = false; // Reset stopSpam flag

  for (let i = 0; i < spamCount; i++) {
    if (stopSpam) {
      stopSpam = false; // Reset the flag
      spamInitiatorId = null; // Reset initiator
      break;
    }
    await sock.sendMessage(remoteJid, { text: spamText, mentions: mentions });
    await delay(1000); // 1-second delay between spam messages
  }

  if (!stopSpam) {
    await sock.sendMessage(remoteJid, { text: "Spam complete! Now everyone will sit in peace." });
  }
}

/**
 * Sends a help message listing all commands.
 * @param {object} sock - The Baileys socket object.
 * @param {string} jid - The JID to send the message to.
 */
async function sendHelpMessage(sock, jid) {
  const helpMessage = `
*🌟 Tone-Aware WhatsApp Bot Commands 🌟*

🤖 *Key Features:*
- Conversation tone detection (Funny, Chill, Serious)
- Roman Urdu replies
- Spam detection & automated roasts

📜 *Commands:*
- \`!joke\`: Tell a funny Roman Urdu joke.
- \`!roast @user\`: Roast a user in funny Roman Urdu.
- \`!fact\`: Tell an interesting Roman Urdu fact.
- \`!mood\`: Tell the group's current mood.
- \`!tagall\`: Tag all group members.
- \`!news\`: Present today's top headlines in Roman Urdu.
- \`!quote\`: Send a random motivational or funny quote in Roman Urdu.
- \`!spam [@user] \\"<message>\\"\` <count>: Spam the group with the specified message <count> times. ([@user is optional])
- \`Stop @${sock.user.id.split(":")[0]}\`: Stop spam (only the initiator can stop it).
- \`!help\`: Show this help message.

✨ *Other Reactions:*
- "Good morning" / "Good night": Bot will react with an emoji.

_Note: Bot automatically detects tone and replies in Roman Urdu if mentioned or in private chat._
`;
  await sock.sendMessage(jid, { text: helpMessage });
}


// --- Start the bot ---
connectToWhatsApp();

// Express server for health check (optional, but good for hosting platforms)
app.get("/", (req, res) => {
  res.status(200).send("WhatsApp Bot is running!");
});

app.listen(port, () => {
  console.log(`Express server listening on port ${port}`);
});

// Removed the periodic upload to Firebase as Storage feature is no longer used.
// If using local multi-file auth state, the 'creds.update' listener handles saving to local files.
