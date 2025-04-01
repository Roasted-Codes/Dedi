/**
 * Dedi Bot - Discord bot for managing Vultr VPS instances
 * 
 * This is the main entry point for the bot. It loads commands from the commands directory,
 * initializes services, and handles Discord events.
 */

// Environment variables
require('dotenv').config();

// Discord.js imports
const { 
  Client, 
  GatewayIntentBits, 
  Collection, 
  REST, 
  Routes 
} = require('discord.js');

// File system and path handling
const fs = require('fs');
const path = require('path');

// Create a new Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Create a collection to store commands
client.commands = new Collection();

/**
 * Load commands from the specified directory
 * 
 * @param {string} directory - Path to the directory containing command files
 */
function loadCommands(directory) {
  // Get all JavaScript files in the directory
  const commandFiles = fs.readdirSync(directory)
    .filter(file => file.endsWith('.js'));
  
  console.log(`Loading commands from ${directory}...`);
  
  // Load each command module and add it to the collection
  for (const file of commandFiles) {
    const filePath = path.join(directory, file);
    const command = require(filePath);
    
    // Add command to collection
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      console.log(`✅ Loaded command: ${command.data.name}`);
    } else {
      console.warn(`⚠️ Command at ${filePath} is missing required properties`);
    }
  }
}

// When the client is ready, run this code (only once)
client.once('ready', async () => {
  console.log(`Bot is ready! Logged in as ${client.user.tag}`);
  
  try {
    // Register all commands with Discord
    await registerCommands();
    console.log('✅ All slash commands registered successfully');
  } catch (error) {
    console.error('❌ Error registering slash commands:', error);
  }
});

/**
 * Register slash commands with Discord
 */
async function registerCommands() {
  try {
    const commands = [...client.commands.values()].map(command => command.data.toJSON());
    
    // Create REST API client
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    console.log(`Registering ${commands.length} application commands...`);
    
    // Register globally (or you could do guild-specific registration)
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    
    console.log(`Successfully registered ${commands.length} application commands.`);
  } catch (error) {
    console.error('Error registering commands:', error);
    throw error;
  }
}

// Handle incoming slash commands
client.on('interactionCreate', async interaction => {
  // Ignore non-command interactions
  if (!interaction.isCommand()) return;
  
  const command = client.commands.get(interaction.commandName);
  
  if (!command) {
    console.error(`Command ${interaction.commandName} not found`);
    return interaction.reply({ 
      content: 'Sorry, this command is not available.', 
      ephemeral: true 
    });
  }
  
  try {
    // Execute the command
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing command ${interaction.commandName}:`, error);
    
    // Reply with error if the interaction hasn't been replied to yet
    const replyMethod = interaction.replied || interaction.deferred
      ? interaction.followUp
      : interaction.reply;
    
    replyMethod.call(interaction, { 
      content: 'There was an error while executing this command.', 
      ephemeral: true 
    }).catch(console.error);
  }
});

// Load commands from directories
loadCommands(path.join(__dirname, 'commands/public'));
// Uncomment to load admin commands when ready
// loadCommands(path.join(__dirname, 'commands/admin'));

// Log in to Discord with your client's token
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('Bot is connecting to Discord...'))
  .catch(error => console.error('Failed to login:', error));
