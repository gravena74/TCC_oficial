// Ponto de extensão para um provedor real. Não há chamadas externas nesta versão.
// O futuro worker deverá ler notification_deliveries, carregar a mensagem de
// notifications e chamar send com uma chave idempotente igual ao ID da entrega.
// Após habilitar o provedor, é necessário decidir quais avisos antigos ainda enviar.
export const whatsappTransport = Object.freeze({
  enabled: false,
  async send() {
    const error = new Error("O WhatsApp da empresa ainda não foi conectado.");
    error.code = "WHATSAPP_NOT_CONFIGURED";
    throw error;
  },
});
