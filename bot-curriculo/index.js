const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const pdf = require('html-pdf-node');

// 🚀 Controle de estados
const sessions = {};

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        auth: state,
        version
    });

    console.log('🚀 Bot inicializado...');

    // 🔥 Conexão + QR
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('📲 Escaneie o QR Code:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Conexão encerrada. Reconectando:', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ Bot conectado ao WhatsApp!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // 🔥 Fluxo com controle de estados
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!text) return;

        console.log(`📩 Mensagem de ${sender}: "${text}"`);

        // Se não existe sessão, inicia
        if (!sessions[sender]) {
            if (text.toLowerCase() === 'teste') {
                sessions[sender] = { step: 'nome', data: {} };
                await sock.sendMessage(sender, { text: 'Perfeito! Me envie seu nome completo:' });
            }
            return;
        }

        const session = sessions[sender];

        if (session.step === 'nome') {
            session.data.nome = text;
            session.step = 'experiencias';
            await sock.sendMessage(sender, { text: 'Agora me envie suas experiências profissionais:' });

        } else if (session.step === 'experiencias') {
            session.data.experiencias = text;
            session.step = 'formacao';
            await sock.sendMessage(sender, { text: 'Ótimo! Agora me envie sua formação acadêmica:' });

        } else if (session.step === 'formacao') {
            session.data.formacao = text;
            session.step = 'skills';
            await sock.sendMessage(sender, { text: 'Por fim, me envie suas principais habilidades:' });

        } else if (session.step === 'skills') {
            session.data.skills = text;
            await sock.sendMessage(sender, { text: 'Perfeito! Gerando seu currículo... ⏳' });

            const template = fs.readFileSync(path.join(__dirname, 'templates/curriculo.html'), 'utf8');

            const html = template
                .replace('{{nome}}', session.data.nome)
                .replace('{{experiencias}}', session.data.experiencias)
                .replace('{{formacao}}', session.data.formacao)
                .replace('{{skills}}', session.data.skills);

            const file = { content: html };
            const pdfBuffer = await pdf.generatePdf(file, { format: 'A4' });

            await sock.sendMessage(sender, {
                document: pdfBuffer,
                mimetype: 'application/pdf',
                fileName: 'curriculo.pdf',
                caption: 'Aqui está seu currículo, gerado com IA. ✔️'
            });

            console.log(`🚀 Currículo enviado para ${sender}`);

            delete sessions[sender]; // ⚠️ Finaliza a sessão após gerar
        }
    });
}

startBot();
