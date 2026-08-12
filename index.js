const express = require("express");
const io = require("socket.io-client");
const fetch = require("node-fetch");

const app = express();

app.get("/", (req, res) => {
  res.send("Gible tracker rodando! 🐉");
});

// Rota de teste manual
app.get("/test-gible", (req, res) => {
  console.log("🧪 [TESTE] Rota /test-gible chamada manualmente via navegador!");
  const htmlFalso = `<a href="/characters/D HOHENHEIM"><i class="fa fa-user"></i> <i class="fas fa-circle" aria-hidden="true" style="color: #C0C0C0"></i> <span class="playerActivities"><b>D HOHENHEIM</b></span></a> 💪 defeated a special pokémon 💥 <b>Gible</b>`;
  processarPacote([htmlFalso]);
  res.send("🧪 Teste disparado! Veja o console e o Discord.");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Servidor ativo na porta " + (process.env.PORT || 3000));
});

const DISCORD_WEBHOOK_URL =
  process.env.DISCORD_WEBHOOK_URL ||
  "https://discord.com/api/webhooks/1536879943848300646/QxA1UV9p2Sh1uS0Me8TjYeuEXEdnKQ88UcoShdZWfbVlJknv00bUS1Qu0k6Z0_AganR4";

const COR_MUNDO_SILVER = "#C0C0C0";

console.log("🔌 Iniciando tentativa de conexão com otponline.com...");

const socket = io("https://otponline.com", {
  path: "/activies/socket.io",
  transports: ["websocket"],
  extraHeaders: {
    "Origin": "https://otponline.com",
    "Referer": "https://otponline.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  }
});

const vistos = new Set();
const LIMITE_HISTORICO = 300;

// ============================================================
// EXTRAI AS INFORMAÇÕES DA ATIVIDADE
// ============================================================
function extrairAtividade(html) {
  console.log("🔍 [EXTRAÇÃO] Analisando HTML recebido...");

  // Extrai todo o conteúdo interno de cada tag <b>...</b>
  const matches = [...html.matchAll(/<b>(.*?)<\/b>/gi)].map((m) =>
    m[1].replace(/<[^>]*>/g, "").trim()
  );

  const nomeJogador = matches[0] || "Desconhecido";
  const nomePokemon = matches[matches.length - 1] || "Desconhecido";

  // Captura o código de cor do mundo (#HEX)
  const corMatch = html.match(/color:\s*(#[0-9a-fA-F]{3,6})/i);
  const cor = corMatch ? corMatch[1].toUpperCase() : null;
  const ehSilver = cor === COR_MUNDO_SILVER;

  const filtroGible = nomePokemon.toLowerCase().includes("gible");

  console.log(
    `📊 [DADOS EXTRAÍDOS] Jogador: "${nomeJogador}" | Pokémon: "${nomePokemon}" | Cor: "${cor}" | É Gible? ${filtroGible} | É Silver? ${ehSilver}`
  );

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
// ENVIA MENSAGEM COM EMBED FORMATADO PARA O DISCORD
// ============================================================
async function enviarDiscord(info) {
  console.log("🚀 [DISCORD] Tentando enviar mensagem via Webhook...");

  const dataHora = new Date().toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const payload = {
    embeds: [
      {
        title: "🐉 Gible Detectado no Mundo Silver!",
        color: 12632256, // Código numérico para a cor prata (#C0C0C0)
        fields: [
          {
            name: "👤 Treinador",
            value: `\`${info.nomeJogador}\``,
            inline: true,
          },
          {
            name: "🎯 Pokémon",
            value: `\`${info.nomePokemon}\``,
            inline: true,
          },
          {
            name: "🌍 Mundo",
            value: `Silver (\`${info.cor}\`)`,
            inline: true,
          },
        ],
        footer: {
          text: `OTP Online Tracker • ${dataHora}`,
        },
      },
    ],
  };

  try {
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const texto = await response.text();
      console.error(`❌ [DISCORD ERRO] Resposta ${response.status}: ${texto}`);
      return;
    }

    console.log("✅ [DISCORD] Alerta enviado com sucesso!");
  } catch (err) {
    console.error("❌ [DISCORD ERRO] Falha no envio:", err.message);
  }
}

// ============================================================
// PROCESSAMENTO DO PACOTE DE DADOS
// ============================================================
function processarPacote(data) {
  if (!data) return;

  let html = Array.isArray(data) ? data[0] : data;
  if (Array.isArray(html)) html = html[0];

  if (typeof html !== "string") return;

  if (vistos.has(html)) {
    console.log("🔁 [FILTRO DUPLICADO] Atividade repetida ignorada.");
    return;
  }

  vistos.add(html);

  if (vistos.size > LIMITE_HISTORICO) {
    const primeiro = vistos.values().next().value;
    vistos.delete(primeiro);
  }

  const info = extrairAtividade(html);

  if (info.filtroGible && info.ehSilver) {
    console.log("🐉 [ALERTA] GIBLE + SILVER DETECTADO!");
    enviarDiscord(info);
  }
}

// ============================================================
// SOCKET.IO EVENTS & LOOP DE SOLICITAÇÃO (POLLING)
// ============================================================
let intervalId = null;

socket.on("connect", () => {
  console.log(`✅ [SOCKET] Conectado com sucesso! ID da Sessão: ${socket.id}`);

  if (intervalId) clearInterval(intervalId);

  socket.emit("getActivitie", "pt-br");

  intervalId = setInterval(() => {
    socket.emit("getActivitie", "pt-br");
  }, 2500);
});

socket.on("disconnect", (motivo) => {
  console.log(`🔌 [SOCKET] Desconectado! Motivo: ${motivo}`);
  if (intervalId) clearInterval(intervalId);
});

socket.on("connect_error", (err) => {
  console.log(`❌ [SOCKET ERRO] Falha na conexão: ${err.message}`);
});

// INTERCEPTOR COMPATÍVEL COM SOCKET.IO v2.4.0
const originalOnevent = socket.onevent;
socket.onevent = function (packet) {
  const args = packet.data || [];
  const eventName = args[0];

  if (eventName === "sendActivie") {
    processarPacote(args.slice(1));
  } else {
    originalOnevent.call(this, packet);
  }
};
