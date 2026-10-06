// Discord.js v14 + Discord Player v7 tek dosyalık müzik botu
// Komutlar: /e play, /e stop, /e skip, /e pause, /e resume, /e queue

require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType,
} = require("discord.js");
const { Player } = require("discord-player");
const { YoutubeExtractor } = require("discord-player-youtubei");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error(
    "DISCORD_TOKEN, CLIENT_ID ve GUILD_ID değişkenlerini ayarlamalısın."
  );
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const player = new Player(client);

const commands = [
  new SlashCommandBuilder()
    .setName("e")
    .setDescription("Müzik botu komutları")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("play")
        .setDescription("Şarkı veya YouTube URL'si çalar")
        .addStringOption((option) =>
          option
            .setName("sarki")
            .setDescription("Şarkı adı ya da URL")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("stop").setDescription("Müziği durdurur ve kuyruğu temizler")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("skip").setDescription("Sıradaki şarkıya geçer")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("pause").setDescription("Müziği duraklatır")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("resume").setDescription("Müziği devam ettirir")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("queue").setDescription("Müzik kuyruğunu gösterir")
    )
    .toJSON(),
];

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: commands,
  });
  console.log("/e komutları sunucuya yüklendi.");
}

function getQueue(guildId) {
  return player.nodes.get(guildId);
}

function getVoiceChannel(interaction) {
  const channel = interaction.member?.voice?.channel;
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    return null;
  }
  return channel;
}

client.once("ready", async () => {
  console.log(`${client.user.tag} aktif.`);

  try {
    // Discord Player v7'de extractors açıkça kaydedilir.
    await player.extractors.register(YoutubeExtractor, {});
    console.log("YouTube extractor hazır.");
  } catch (error) {
    console.error("YouTube extractor yüklenemedi:", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "e") {
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  try {
    if (subcommand === "play") {
      const voiceChannel = getVoiceChannel(interaction);
      if (!voiceChannel) {
        return interaction.reply({
          content: "Önce bir ses kanalına girmen gerekiyor.",
          ephemeral: true,
        });
      }

      const query = interaction.options.getString("sarki", true);
      await interaction.deferReply();

      const result = await player.play(voiceChannel, query, {
        nodeOptions: {
          metadata: interaction.channel,
          volume: 80,
          leaveOnEnd: true,
          leaveOnEmpty: true,
          leaveOnEmptyCooldown: 300000,
        },
      });

      const title = result.track?.title || query;
      return interaction.editReply(`Kuyruğa eklendi: **${title}**`);
    }

    const queue = getQueue(interaction.guildId);

    if (subcommand === "stop") {
      if (!queue) {
        return interaction.reply("Şu anda çalan bir şey yok.");
      }
      queue.delete();
      return interaction.reply("Müzik durduruldu ve kuyruk temizlendi.");
    }

    if (!queue) {
      return interaction.reply("Şu anda aktif bir müzik kuyruğu yok.");
    }

    if (subcommand === "skip") {
      const skipped = await queue.node.skip();
      return interaction.reply(
        skipped ? "Sıradaki şarkıya geçildi." : "Atlanacak başka şarkı yok."
      );
    }

    if (subcommand === "pause") {
      if (!queue.node.isPlaying()) {
        return interaction.reply("Şu anda çalan bir şarkı yok.");
      }
      queue.node.pause();
      return interaction.reply("Müzik duraklatıldı.");
    }

    if (subcommand === "resume") {
      queue.node.resume();
      return interaction.reply("Müzik devam ediyor.");
    }

    if (subcommand === "queue") {
      const current = queue.currentTrack;
      const upcoming = queue.tracks.toArray();
      const lines = upcoming
        .slice(0, 10)
        .map((track, index) => `${index + 1}. ${track.title}`);

      let message = current ? `Şu an: **${current.title}**` : "Şu an şarkı yok.";
      if (lines.length) {
        message += `\n\n**Sıradaki:**\n${lines.join("\n")}`;
      } else {
        message += "\n\nKuyruk boş.";
      }
      return interaction.reply(message);
    }
  } catch (error) {
    console.error("Komut hatası:", error);
    const message = "Bir hata oluştu. URL'yi veya arama ifadesini kontrol et.";

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(message).catch(() => {});
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    }
  }
});

(async () => {
  try {
    await registerCommands();
    await client.login(TOKEN);
  } catch (error) {
    console.error("Bot başlatılamadı:", error);
    process.exit(1);
  }
})();
