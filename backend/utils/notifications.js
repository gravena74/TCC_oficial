import { v4 as uuid } from "uuid";

const TITLES = {
  agendado: "Agendamento aprovado",
  recusado: "Agendamento recusado",
  cancelado: "Agendamento cancelado",
};

export function appointmentNotification(appointment, status, petName, serviceName) {
  if (!TITLES[status]) return null;
  const date = appointment.date.split("-").reverse().join("/");
  const details = `${petName}: ${serviceName} em ${date} às ${appointment.time}.`;
  const ending = status === "agendado"
    ? "O pet shop confirmou seu atendimento."
    : status === "recusado"
      ? "O pet shop não pôde aceitar esta solicitação. Você pode escolher outro horário pelo site."
      : "Este atendimento foi cancelado. Consulte seus agendamentos pelo site.";
  return { title: TITLES[status], message: `${details} ${ending}` };
}

// Executar na mesma transação da mudança de status: decisão e fila WhatsApp são atômicas.
// A trava do agendamento e a chave única impedem duplicação por repetição da ação.
// notifications guarda somente o conteúdo para automação, sem caixa de avisos no app.
export async function queueAppointmentWhatsApp(tx, appointment, status, { pet, service }) {
  if (!TITLES[status]) return;
  const content = appointmentNotification(appointment, status, pet.name, service.name);
  if (!content) return;
  const owner = await tx.get(`SELECT phone FROM users WHERE id = ?`, [appointment.user_id]);
  const id = uuid();
  await tx.run(
    `INSERT INTO notifications (id, user_id, appointment_id, event_type, title, message)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, appointment.user_id, appointment.id, status, content.title, content.message]
  );
  // Somente prepara o canal externo. Não representa envio, entrega ou leitura no WhatsApp.
  await tx.run(
    `INSERT INTO notification_deliveries (id, notification_id, channel, recipient, status)
     VALUES (?, ?, 'whatsapp', ?, 'aguardando_integracao')`,
    [uuid(), id, owner.phone]
  );
}
