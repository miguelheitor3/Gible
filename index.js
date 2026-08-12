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

// Coloque o webhook do Discord como variável de ambiente.
// NÃO coloque o webhook diretamente no código.
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

if (!DISCORD_WEBHOOK_URL) {
  console.error("❌ DISCORD_WEBHOOK_URL não foi configurada.");
  process.exit(1);
}

const COR_MUNDO_SILVER = "#C0C0C0";

const socket = io("https://otponline.com", {
  path: "/activies/socket.io",
  transports: ["websocket"],
});

const vistos = new Set();
const LIMITE_HISTORICO = 300;


// ============================================================
// EXTRAI AS INFORMAÇÕES DA ATIVIDADE
// ============================================================

function extrairAtividade(html) {
  // Extrai a cor do mundo
  const cor = html.match(/style=["']color:\s*(#[0-9a-fA-F]{3,6})["']/i)?.[1]?.toUpperCase() || null;
  const ehSilver = cor === COR_MUNDO_SILVER;

  // Extrai todas as tags <b>...</b> limpando qualquer resíduo de tag HTML
  const matches = [...html.matchAll(/<b>(.*?)<\/b>/gi)].map(m => m[1].replace(/<[^>]*>/g, '').trim());

  const nomeJogador = matches[0] || null;
  const nomePokemon = matches[matches.length - 1] || null;

  const filtroGible = nomePokemon?.toLowerCase() === "gible";

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

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({

        content:
          `🐉 **Gible detectado (Silver)!**\n` +
          `👤 ${info.nomeJogador || "Desconhecido"}\n` +
          `🌍 Silver (${info.cor})\n` +
          `🎯 ${info.nomePokemon}`,

      }),
    });

    if (!response.ok) {

      const texto = await response.text();

      console.error(
        `❌ Discord respondeu ${response.status}: ${texto}`
      );

      return;
    }

    console.log("✅ Mensagem enviada ao Discord!");

  } catch (err) {

    console.error(
      "❌ Erro ao enviar pro Discord:",
      err.message
    );

  }
}


// ============================================================
// SOCKET.IO
// ============================================================

socket.on("connect", () => {

  console.log(
    "✅ Conectado ao otponline.com"
  );

});

socket.on("disconnect", (motivo) => {

  console.log(
    "🔌 Desconectado:",
    motivo
  );

});

socket.on("connect_error", (err) => {

  console.log(
    "❌ Erro de conexão:",
    err.message
  );

});


// ============================================================
// RECEBE AS ATIVIDADES
// ============================================================

socket.on("sendActivie", (data) => {

  // Evita erro caso venha um pacote vazio
  if (!data || !data[0]) {
    return;
  }

  const html = data[0];


  // ==========================================================
  // EVITA PROCESSAR A MESMA ATIVIDADE DUAS VEZES
  // ==========================================================

  if (vistos.has(html)) {
    return;
  }

  vistos.add(html);

  if (vistos.size > LIMITE_HISTORICO) {

    const primeiro =
      vistos.values().next().value;

    vistos.delete(primeiro);

  }


  // ==========================================================
  // EXTRAI OS DADOS
  // ==========================================================

  const info =
    extrairAtividade(html);


  // ==========================================================
  // FILTRO FINAL
  //
  // SOMENTE:
  //
  // Pokémon = Gible
  // Mundo   = #C0C0C0 (Silver)
  //
  // ==========================================================

  if (
    info.filtroGible &&
    info.ehSilver
  ) {

    console.log(
      "🐉 GIBLE + SILVER DETECTADO!"
    );

    console.log(info);

    enviarDiscord(info);

  }

});
