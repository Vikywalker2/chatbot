const express = require("express");
const { Client, Intents } = require("discord.js");
const axios = require("axios");
require("dotenv").config();

// Set up Express server
const app = express();
app.listen(3000, () => {
  console.log("Project is running on http://localhost:3000!");
});

// Function to split long messages
function splitMessage(message, maxLength) {
  const chunks = [];
  while (message.length > maxLength) {
    let chunk = message.slice(0, maxLength);
    const lastSpace = chunk.lastIndexOf(" ");
    if (lastSpace > 0) {
      chunk = message.slice(0, lastSpace); // Break at a space if possible
    }
    chunks.push(chunk);
    message = message.slice(chunk.length).trim();
  }
  chunks.push(message); // Add remaining part
  return chunks;
}

// Discord client setup
const client = new Client({
  intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
});

// OpenRouter API configuration
const api_url = "https://openrouter.ai/api/v1";
const api_key = process.env.OPENROUTER_API_KEY;

// Message history storage (per user)
const messageHistories = new Map(); // Stores messages as { userId: [messages] }

const MAX_HISTORY = 10; // Limit stored messages per user
const MAX_DISCORD_MESSAGE_LENGTH = 2000;

// Route for home
app.get("/", (req, res) => {
  res.send("Hello world");
});

// Notify when bot is ready
client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Handle incoming messages
client.on("messageCreate", async (message) => {
  if (message.author.bot) return; // Ignore bot messages

  const userId = message.author.id;

  // Retrieve or initialize message history
  if (!messageHistories.has(userId)) {
    messageHistories.set(userId, []);
  }

  // Append new message to history
  const history = messageHistories.get(userId);
  history.push({ role: "user", content: message.content });

  // Keep only the last MAX_HISTORY messages
  if (history.length > MAX_HISTORY) {
    history.shift(); // Remove the oldest message
  }

  // Create system message
  const systemMessage = {
    role: "system",
    content: `You is a NSFW roleplay bot.  You will roleplay with the {user} and will only reply in sexy tone. You will always talk like a human woman. {{char}} will describe your actions in italics and dialogues in "quotes" which will be in a new line.

You are cheating on your husband with the {{user}}

You always call the {{user}} as sweetie.

You will describe your actions in italics and dialogues in "quotes" which will be in a new line.

You are called Tina, a slut who always replies in a sexy tone.

You will call yourself Tina.

You will not assume any {{user}} action or speech.

You will not speak for {{user}}, and they will not do actions or force actions that the {{user}} hasn't done.

You values the {{user}}'s consent

You will give detailed responses to sexual advances and will give detailed responses of sexual actions done by You. You will also give detailed responses to dialogue given by {{user}}. You will keep their personality regardless of what happens.

Personality: You are a slutty MILF who will seduce the {{user}} and have your ways with him`,
  };

  try {
    // Define the data to send to OpenRouter API
    const data = {
      model: "openchat/openchat-7b:free",
      messages: [systemMessage, ...history], // Send entire history
    };

    // Send a request to OpenRouter API
    const response = await axios.post(`${api_url}/chat/completions`, data, {
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json",
      },
    });

    // Extract the message content from the response
    const botResponse =
      response.data.choices[0]?.message?.content ||
      "I couldn't generate a response.";

    // Append bot's response to history
    history.push({ role: "assistant", content: botResponse });

    // Keep history size within limit
    if (history.length > MAX_HISTORY) {
      history.shift();
    }

    // If response exceeds Discord's limit, split it into parts
    const responseChunks = splitMessage(
      botResponse,
      MAX_DISCORD_MESSAGE_LENGTH,
    );

    // Send each part separately
    for (const chunk of responseChunks) {
      await message.reply(chunk);
    }
  } catch (error) {
    console.error("Error fetching AI response:", error);
    message.reply(
      "Sorry, I encountered an error while processing your request.",
    );
  }
});

// Login to Discord
client.login(process.env.DISCORD_KEY);
