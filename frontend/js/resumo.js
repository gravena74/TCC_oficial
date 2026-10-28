import { api, resolveAssetUrl } from "./api.js";
import { requireAuth } from "./guard.js";
import { getBooking, resetBooking, updateBooking } from "./booking.js";
import { formatCents, formatDateLong } from "./format.js";
import { escapeHtml } from "./html.js";

const CHECKIN_LABEL = {
  leva_ao_pet_shop: "Você leva o pet ao pet shop",
  busca_em_casa: "Buscamos o pet na sua casa",
};
const CHECKOUT_LABEL = {
  retira_no_pet_shop: "Você retira o pet no pet shop",
  entrega_em_casa: "Entregamos o pet na sua casa",
};

const user = await requireAuth();
if (user) {
  const booking = getBooking();
  if (!booking.service || !booking.checkinMode || !booking.checkoutMode) {
    window.location.replace("checkout.html");
  } else {
    document.getElementById("authLoading").style.display = "none";
    document.getElementById("screen").style.display = "flex";
    init(booking);
  }
}

function init(booking) {
  document.getElementById("petPhoto").innerHTML = booking.pet?.photo_url
    ? `<img src="${escapeHtml(resolveAssetUrl(booking.pet.photo_url))}" alt="${escapeHtml(booking.pet.name)}">`
    : `<span class="material-symbols-rounded" aria-hidden="true">pets</span>`;
  document.getElementById("petName").textContent = booking.pet?.name || "";
  document.getElementById("serviceLine").textContent =
    `${booking.service.name} · ${formatDateLong(booking.date)} às ${booking.time}`;

  document.getElementById("checkinLine").innerHTML =
    `<span class="material-symbols-rounded" aria-hidden="true">check_circle</span> ${CHECKIN_LABEL[booking.checkinMode]}`;
  document.getElementById("checkoutLine").innerHTML =
    `<span class="material-symbols-rounded" aria-hidden="true">check_circle</span> ${CHECKOUT_LABEL[booking.checkoutMode]}`;

  if (booking.address) {
    document.getElementById("addressCard").style.display = "block";
    document.getElementById("addressLine").innerHTML =
      `${escapeHtml(booking.address.street)}, ${escapeHtml(booking.address.number)} — ${escapeHtml(booking.address.neighborhood)}<br>` +
      `${escapeHtml(booking.address.city)}/${escapeHtml(booking.address.state)} · CEP ${escapeHtml(booking.address.cep)}`;
  }

  const confirmBtn = document.getElementById("confirmBtn");
  const errorEl = document.getElementById("errorMsg");
  const paymentMethod = document.getElementById("paymentMethod");
  paymentMethod.value = booking.paymentMethod || "";
  let quote = null;
  const payload = () => ({ pet_id: booking.pet.id, service_id: booking.service.id,
    date: booking.date, time: booking.time, checkin_mode: booking.checkinMode,
    checkout_mode: booking.checkoutMode, customer_package_id: booking.customerPackageId || null });

  function updateConfirm() {
    confirmBtn.disabled = !quote || (quote.total_cents > 0 && !paymentMethod.value);
  }
  paymentMethod.addEventListener("change", () => { updateBooking({ paymentMethod: paymentMethod.value || null }); updateConfirm(); });

  api.estimateAppointment(payload()).then(({ estimate }) => {
    quote = estimate;
    document.getElementById("servicePriceLabel").textContent = `Serviço: ${booking.service.name}`;
    document.getElementById("servicePriceValue").textContent = quote.package_name ? "Incluído no pacote" : formatCents(quote.service_price_cents);
    const requested = booking.checkinMode === "busca_em_casa" || booking.checkoutMode === "entrega_em_casa";
    document.getElementById("feeValue").textContent = quote.pickup_fee_cents > 0 ? formatCents(quote.pickup_fee_cents) : requested ? "Incluído no contrato" : "Não solicitado";
    document.getElementById("totalValue").textContent = quote.total_cents ? formatCents(quote.total_cents) : "Sem valor adicional previsto";
    document.getElementById("paymentSection").hidden = quote.total_cents === 0;
    if (quote.package_name) {
      const summary = document.getElementById("packageSummary");
      summary.hidden = false;
      summary.textContent = `${quote.package_name}. Será reservado 1 crédito. Cancelamento com ${quote.cancellation_notice_hours}h de antecedência. ${quote.pickup_included ? "Busca incluída. " : ""}${quote.delivery_included ? "Entrega incluída." : ""}`;
    }
    updateConfirm();
  }).catch((err) => { errorEl.textContent = err.message; errorEl.style.display = "block"; })
    .finally(() => { document.getElementById("estimateLoading").hidden = true; });

  confirmBtn.addEventListener("click", async () => {
    if (!quote || confirmBtn.disabled) return;
    errorEl.style.display = "none";
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Confirmando...";
    try {
      let addressId = null;
      if (booking.address) {
        const { address } = await api.createAddress({ ...booking.address, is_default: true });
        addressId = address.id;
      }
      const { appointment } = await api.createAppointment({
        ...payload(),
        payment_method: quote.total_cents > 0 ? paymentMethod.value : null,
        address_id: addressId,
      });
      resetBooking();
      sessionStorage.setItem("cafofo_last_appointment", JSON.stringify(appointment));
      window.location.replace("sucesso.html");
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = "block";
    } finally {
      updateConfirm();
      confirmBtn.textContent = "Enviar solicitação";
    }
  });
}
