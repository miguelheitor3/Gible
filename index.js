const express = require("express");
const io = require("socket.io-client");
const fetch = require("node-fetch");

const app = express();

app.get("/", (req, res) => {
  res.send("Gible tracker rodando! 🐉");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Servidor ativo");
});

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

if (!DISCORD_WEBHOOK_URL) {
  console.error("❌ DISCORD_WEBHOOK_URL não foi configurada.");
  process.exit(1);
}

// Códigos Hex conhecidos do Silver no OTP (Hex ou conversão de RGB)
const CORES_SILVER = ["#C0C0C0", "#CCCCCC", "#SILVER"];

const socket = io("https://otponline.com", {
  path: "/activies/socket.io",
  transports: ["websocket"],
});

const vistos = new Set();
const LIMITE_HISTORICO = 300;

// Helper para converter rgb(r, g, b) para HEX
function rgbToHex(rgbStr) {
  const result = rgbStr.match(/\d+/g);
  if (!result || result.length < 3) return null;
  const r = parseInt(result[0]).toString(16).padStart(2, "0");
  const g = parseInt(result[1]).toString(16).padStart(2, "0");
  const b = parseInt(result[2]).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`.toUpperCase();
}

// ============================================================
// EXTRAI AS INFORMAÇÕES DA ATIVIDADE
// ============================================================
function extrairAtividade(html) {
  let cor = null;

  // 1. Tenta extrair HEX
  const hexMatch = html.match(/color:\s*(#[0-9a-fA-F]{3,6})/i);
  if (hexMatch) {
    cor = hexMatch[1].toUpperCase();
    if (cor.length === 4) {
      cor = `#${cor[1]}${cor[1]}${cor[2]}${cor[2]}${cor[3]}${cor[3]}`;
    }
  } else {
    // 2. Tenta extrair RGB caso não seja HEX
    const rgbMatch = html.match(/color:\s*(rgb\([^)]+\))/i);
    if (rgbMatch) {
      cor = rgbToHex(rgbMatch[1]);
    }
  }

  // Verifica se a cor corresponde ao Silver
  const ehSilver = CORES_SILVER.includes(cor);

  // Extrai o conteúdo das tags <b> limpando tags aninhadas
  const matches = [...html.matchAll(/<b>([\s\S]*?)<\/b>/gi)].map((m) =>
    m[1].replace(/<[^>]*>/g, "").trim()
  );

  const nomeJogador = matches[0] || "Desconhecido";
  const nomePokemon = matches[matches.length - 1] || "Desconhecido";

  // Busca "gible" em qualquer parte do nome do Pokémon ou no HTML
  const filtroGible =
    nomePokemon.toLowerCase().includes("gible") ||
    /<b>\s*gible\s*<\/b>/i.test(html);

  return {
    nomeJogador,
    nomePokemon,
    filtroGible,
    cor,
    ehSilver,
    raw: html,
  };
}

// ============================================================
// ENVIA MENSAGEM PARA O DISCORD
// ============================================================
async function enviarDiscord(info) {
  try {
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content:
          `🐉 **Gible detectado (Silver)!**\n` +
          `👤 ${info.nomeJogador}\n` +
          `🌍 Silver (${info.cor || "Desconhecida"})\n` +
          `🎯 ${info.nomePokemon}`,
      }),
    });

    if (!response.ok) {
      const texto = await response.text();
      console.error(`❌ Discord respondeu ${response.status}: ${texto}`);
      return;
    }

    console.log("✅ Mensagem enviada ao Discord!");
  } catch (err) {
    console.error("❌ Erro ao enviar pro Discord:", err.message);
  }
}

// ============================================================
// SOCKET.IO EVENTS
// ============================================================
socket.on("connect", () => {
  console.log("✅ Conectado ao otponline.com");
});

socket.on("disconnect", (motivo) => {
  console.log("🔌 Desconectado:", motivo);
});

socket.on("connect_error", (err) => {
  console.log("❌ Erro de conexão:", err.message);
});

// ============================================================
// RECEBE AS ATIVIDADES
// ============================================================
socket.on("sendActivie", (data) => {
  if (!data) return;

  // Trata o payload vindo como Array ou String
  const html = Array.isArray(data) ? data[0] : data;
  if (!html || typeof html !== "string") return;

  if (vistos.has(html)) return;
  vistos.add(html);

  if (vistos.size > LIMITE_HISTORICO) {
    const primeiro = vistos.values().next().value;
    vistos.delete(primeiro);
  }

  const info = extrairAtividade(html);

  // 📡 LOG EM TEMPO REAL DE TODAS AS ATIVIDADES NO RAILWAY
  console.log(
    `[${new Date().toLocaleTimeString("pt-BR")}] 👤 ${info.nomeJogador} | 🎯 ${info.nomePokemon} | 🎨 Cor: ${info.cor || "N/A"}`
  );

  // FILTRO FINAL
  if (info.filtroGible && info.ehSilver) {
    console.log("🐉 GIBLE + SILVER DETECTADO!");
    console.log(info);
    enviarDiscord(info);
  } else if (info.filtroGible && !info.ehSilver) {
    console.log(`⚠️ Gible detectado, mas em OUTRO MUNDO (Cor: ${info.cor})`);
  }
});
