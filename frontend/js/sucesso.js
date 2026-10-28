import { requireAuth } from "./guard.js";
import { formatDateLong } from "./format.js";
import { PAYMENT_LABELS } from "./packages-format.js";

const user = await requireAuth();
if (user) {
  const raw = sessionStorage.getItem("cafofo_last_appointment");
  if (!raw) {
    window.location.replace("pets.html");
  } else {
    const appointment = JSON.parse(raw);
    sessionStorage.removeItem("cafofo_last_appointment");

    document.getElementById("message").textContent =
      `Solicitação para ${appointment.pet_name}: ${appointment.service_name} em ` +
      `${formatDateLong(appointment.date)} às ${appointment.time}. Acompanhe a análise em Meus Agendamentos. ` +
      (appointment.customer_package_id ? "Um crédito do pacote foi reservado. " : "") +
      (appointment.payment_method ? `Forma de pagamento prevista na loja: ${PAYMENT_LABELS[appointment.payment_method]}.` : "");

    document.getElementById("authLoading").style.display = "none";
    document.getElementById("screen").style.display = "flex";
  }
}
