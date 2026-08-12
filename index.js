const express = require("express");
const io = require("socket.io-client");
const fetch = require("node-fetch");

const app = express();
app.get("/", (req, res) => res.send("Gible tracker rodando! 🐉"));
app.listen(process.env.PORT || 3000, () => console.log("🌐 Servidor ativo"));

// Usa variável de ambiente (mais seguro)
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
if (!DISCORD_WEBHOOK_URL) {
  console.error("❌ DISCORD_WEBHOOK_URL não configurada!");
  process.exit(1);
}

const COR_MUNDO_SILVER = "#C0C0C0";

const socket = io("https://otponline.com", {
  path: "/activies/socket.io",
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
});

const vistos = new Set();
const LIMITE_HISTORICO = 300;

function extrairAtividade(html) {
  const partes = html.match(/<b>([^<]+)<\/b>/g) || [];
  const nomeJogador = partes[0]?.replace(/<\/?b>/g, "") || null;
  const nomePokemon = partes[partes.length - 1]?.replace(/<\/?b>/g, "") || null;
  const filtroGible = html.toLowerCase().includes("gible");
  const cor = html.match(/style="color:\s*(#[0-9a-fA-F]{3,6})"/)?.[1] || null;
  return { nomeJogador, nomePokemon, filtroGible, cor, raw: html };
}

async function enviarDiscord(info) {
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `🐉 **Gible detectado (Silver)!**\n${info.nomeJogador} — ${info.nomePokemon}`,
      }),
    });
    console.log("✅ Mensagem enviada pro Discord");
  } catch (err) {
    console.error("❌ Erro ao enviar pro Discord:", err.message);
  }
}

socket.on("connect", () => console.log("✅ Conectado ao otponline.com"));
socket.on("disconnect", (m) => console.log("🔌 Desconectado:", m));
socket.on("connect_error", (err) => console.log("❌ Erro de conexão:", err.message));

socket.on("sendActivie", (data) => {
  const html = data[0];
  if (vistos.has(html)) return;
  vistos.add(html);
  if (vistos.size > LIMITE_HISTORICO) {
    vistos.delete(vistos.values().next().value);
  }

  const info = extrairAtividade(html);

  if (info.filtroGible && info.cor === COR_MUNDO_SILVER) {
    console.log("🐉 Enviando pro Discord:", info);
    enviarDiscord(info);
  }
});

