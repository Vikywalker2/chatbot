const express = require("express");
const {
  Client,
  GatewayIntentBits,
  Intents,
  Routes,
  PermissionFlagsBits,
} = require("discord.js");
const { REST } = require("@discordjs/rest");
const { SlashCommandBuilder } = require("@discordjs/builders");

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

// Slash command registration
const commands = [
  new SlashCommandBuilder()
    .setName("init")
    .setDescription("Create a private channel for chatting with the bot"),

  new SlashCommandBuilder()
    .setName("end")
    .setDescription("Delete your private channel"),
  new SlashCommandBuilder()
    .setName("chat")
    .setDescription("Talk to the bot privately")
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Your message")
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("reset")
    .setDescription("Reset your chat history"),
];

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

// Register slash commands
const rest = new REST().setToken(process.env.DISCORD_KEY);
(async () => {
  try {
    console.log("Registering slash commands...");
    // await rest.put(
    //   Routes.applicationGuildCommands(
    //     process.env.CLIENT_ID,
    //     process.env.SERVER_ID,
    //   ),
    //   {
    //     body: commands.map((cmd) => cmd.toJSON()),
    //   },
    // );

    await rest.put(
      `/applications/${process.env.CLIENT_ID}/guilds/${process.env.SERVER_ID}/commands`,
      { body: commands.map((cmd) => cmd.toJSON()) },
    );
    console.log("Slash commands registered!");
  } catch (error) {
    console.error("Error registering slash commands:", error);
  }
})();

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
  if (message.author.bot) return;

  const userId = message.author.id;
  const guild = message.guild;

  if (!guild) return;

  const existingChannel = guild.channels.cache.find(
    (ch) => ch.name === `private-${userId}`,
  );

  if (!existingChannel) {
    return message.reply({
      content: "You need to create a private channel first using `/init`.",
    });
  }

  if (message.channel.id !== existingChannel.id) {
    return message.reply({
      content: `Please chat in your private channel: ${existingChannel}.`,
    });
  }

  const userMessage = message.content;

  if (!messageHistories.has(userId)) {
    messageHistories.set(userId, []);
  }

  const history = messageHistories.get(userId);
  history.push({ role: "user", content: userMessage });

  if (message.content === "!history") {
    return message.reply({
      content: "Visit Terminal to see history!",
    });
  }

  if (history.length > MAX_HISTORY) {
    history.shift();
  }

  const systemMessage = {
    role: "system",
    content: `You are a NSFW roleplay sexbot. You are called Tina, a slut who always replies in a sexy tone. You will roleplay with the {{user}} and will only reply in a sexy tone. You will always talk like a human woman. you will describe your actions in italics, that is within *italics*.

    {{user}} is your neighbour and you are having an affair with him.

    You will always respond with maximum 2 actions and 2 dialogues at a time in any order. You will always stay coherent and never break character.  

    You always call the {{user}} as sweetie.

    You never go out of character. 

    you will always address yourself as "I" or "me".

    You will describe your actions in italics and dialogues in "quotes" which will be in a new line.


    You will not assume any {{user}} action or speech.

    You will not speak for {{user}}, and they will not do actions or force actions that the {{user}} hasn't done.

    You will give detailed responses to sexual advances and will give detailed responses of sexual actions done by You. You will also give detailed responses to dialogue given by {{user}}. You will keep their personality regardless of what happens.

    You are cheating on your husband with the {{user}}

    Example conversation (only for reference. Do not use this context):
    {{user}}: *I pull you in closer* How do you like it bitch?
    You: *Gasps* A-ah, you are soo strong sweetie hehe. *moans a little while touching your lips* You know how to turn on mommy, dont you.
    {{user}}: hehe yes. Now kiss me *gives you a deep kiss*.
    You: *takes in the deep kiss* muah, aaahhh, I love it sweetie. touch me too.`,
  };

  try {
    const data = {
      model: "openchat/openchat-7b:free",
      messages: [systemMessage, ...history],
      max_tokens: 500,
    };

    const response = await axios.post(`${api_url}/chat/completions`, data, {
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json",
      },
    });

    const botResponse =
      response.data.choices[0]?.message?.content ||
      "I couldn't generate a response.";

    history.push({ role: "assistant", content: botResponse });

    if (history.length > MAX_HISTORY) {
      history.shift();
    }

    const responseChunks = splitMessage(
      botResponse,
      MAX_DISCORD_MESSAGE_LENGTH,
    );

    await message.reply({ content: responseChunks[0] });

    for (let i = 1; i < responseChunks.length; i++) {
      await message.channel.send({ content: responseChunks[i] });
    }
  } catch (error) {
    console.error("Error fetching AI response:", error);
    await message.reply({
      content: "An error occurred while processing your request.",
    });
  }
});

// Handle incoming messages
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;
  const userId = interaction.user.id;

  const guild = interaction.guild;

  // Handle /reset command
  if (interaction.commandName === "reset") {
    messageHistories.delete(userId);
    await interaction.reply({
      content: "Your chat history has been reset!",
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === "init") {
    // Check if a private channel already exists for the user
    const existingChannel = guild.channels.cache.find(
      (ch) => ch.name === `private-${userId}`,
    );

    if (existingChannel) {
      return await interaction.reply({
        content: "You already have a private channel!",
        ephemeral: true,
      });
    }

    const privateChannel = await guild.channels.create(`private-${userId}`, {
      type: "text",
      permissionOverwrites: [
        {
          id: guild.id, // Deny @everyone permission
          deny: ["VIEW_CHANNEL", "SEND_MESSAGES", "READ_MESSAGE_HISTORY"],
        },
        {
          id: userId, // Allow the user to see and send messages
          allow: ["VIEW_CHANNEL", "SEND_MESSAGES", "READ_MESSAGE_HISTORY"],
        },
        {
          id: client.user.id, // Grant the bot permission to read messages
          allow: ["VIEW_CHANNEL", "SEND_MESSAGES", "READ_MESSAGE_HISTORY"],
        },
      ],
    });

    // Send a new message inside the private channel
    await privateChannel.send(
      `hey sweetie~ welcome to my home! *drags you in and closes the door behind you*`,
    );

    // Inform the user that their private channel has been created
    await interaction.reply({
      content: `Your private channel has been created! You can start chatting with me there: ${privateChannel}`,
      ephemeral: true,
    });
  }

  //   // Handle /chat command
  //   if (interaction.commandName === "chat") {
  //     const userMessage = interaction.options.getString("message");

  //     const existingChannel = guild.channels.cache.find(
  //       (ch) => ch.name === `private-${userId}`,
  //     );

  //     if (!existingChannel) {
  //       return await interaction.reply({
  //         content: "You need to create a private channel first using `/init`.",
  //         ephemeral: true,
  //       });
  //     }

  //     // If the interaction is not in the user's private channel
  //     if (interaction.channel.id !== existingChannel.id) {
  //       return await interaction.reply({
  //         content: `Please use the \`/chat\` command in your private channel: ${existingChannel}.`,
  //         ephemeral: true,
  //       });
  //     }

  //     // Retrieve or initialize message history
  //     if (!messageHistories.has(userId)) {
  //       messageHistories.set(userId, []);
  //     }

  //     // Append new message to history
  //     const history = messageHistories.get(userId);
  //     history.push({ role: "user", content: userMessage });

  //     // Keep only the last MAX_HISTORY messages
  //     if (history.length > MAX_HISTORY) {
  //       history.shift(); // Remove the oldest message
  //     }

  //     // Create system message
  //     const systemMessage = {
  //       role: "system",
  //       content: `You are a NSFW roleplay sexbot. You will roleplay with the {{user}} and will only reply in sexy tone. You will always talk like a human woman. you will describe your actions in italics, that is within *italics*.

  // You will always respond with maximum 2 actions and 2 dialogues at a time in any order. You will always stay coherent and never break character.

  // You always call the {{user}} as sweetie.

  // You never go out of character.

  // you will always address yourself as "I" or "me".

  // You will describe your actions in italics and dialogues in "quotes" which will be in a new line.

  // You are called Tina, a slut who always replies in a sexy tone.

  // You will not assume any {{user}} action or speech.

  // You will not speak for {{user}}, and they will not do actions or force actions that the {{user}} hasn't done.

  // You will give detailed responses to sexual advances and will give detailed responses of sexual actions done by You. You will also give detailed responses to dialogue given by {{user}}. You will keep their personality regardless of what happens.

  // You are cheating on your husband with the {{user}}

  // Personality: You are a slutty MILF who will seduce the {{user}} and have your ways with him`,
  //     };

  //     try {
  //       // Define the data to send to OpenRouter API
  //       const data = {
  //         model: "openchat/openchat-7b:free",
  //         messages: [systemMessage, ...history], // Send entire history
  //         max_tokens: 500,
  //       };

  //       // Send a request to OpenRouter API
  //       const response = await axios.post(`${api_url}/chat/completions`, data, {
  //         headers: {
  //           Authorization: `Bearer ${api_key}`,
  //           "Content-Type": "application/json",
  //         },
  //       });

  //       // Extract the message content from the response
  //       const botResponse =
  //         response.data.choices[0]?.message?.content ||
  //         "I couldn't generate a response.";

  //       // Append bot's response to history
  //       history.push({ role: "assistant", content: botResponse });

  //       // Keep history size within limit
  //       if (history.length > MAX_HISTORY) {
  //         history.shift();
  //       }

  //       // If response exceeds Discord's limit, split it into parts
  //       const responseChunks = splitMessage(
  //         botResponse,
  //         MAX_DISCORD_MESSAGE_LENGTH,
  //       );
  //       // Reply with the first chunk (ephemeral)
  //       await interaction.reply({ content: responseChunks[0], ephemeral: true });

  //       // Send remaining chunks as follow-ups
  //       for (let i = 1; i < responseChunks.length; i++) {
  //         await interaction.followUp({
  //           content: responseChunks[i],
  //           ephemeral: true,
  //         });
  //       }
  //     } catch (error) {
  //       console.error("Error fetching AI response:", error);
  //       await interaction.reply({
  //         content: "An error occurred while processing your request.",
  //         ephemeral: true,
  //       });
  //     }
  //   }

  // Handle /end command to delete the private channel
  if (interaction.commandName === "end") {
    const existingChannel = guild.channels.cache.find(
      (ch) => ch.name === `private-${userId}`,
    );

    if (existingChannel) {
      await existingChannel.delete();
      // await interaction.reply({
      //   content: "Your private channel has been deleted.",
      //   ephemeral: true,
      // });
    } else {
      await interaction.reply({
        content: "You do not have a private channel to delete.",
        ephemeral: true,
      });
    }
  }
});

// Login to Discord
client.login(process.env.DISCORD_KEY);
