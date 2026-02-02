
/**
 * ------------------------------
 * TICKET EVENTS
 * ------------------------------
 */
async function ticketRoomJoined(ticket) {
  const { emitToTicket } = require("../eventBus");
  emitToTicket(ticket.id, "ticket:step:changed", ticket); 
}

async function ticketCreated(ticket) {
  const { emitToRole } = require("../eventBus");
  emitToRole(ticket.roleId, "role:ticket:new", ticket);
}

async function ticketStepChanged(step) {
  const { emitToTicket, emitToRole } = require("../eventBus");
  if (!step?.ticket?.id) return;
  emitToTicket(step.ticket.id, "ticket:step:changed", step);
  emitToRole(step.serviceStep?.roleId, "role:step:changed", step);
}

async function ticketCalled(step) {
  const { emitToTicket } = require("../eventBus");
  if (!step?.ticket?.id) return;
  emitToTicket(step.ticket.id, "ticket:announcement", step, true); 
}

async function ticketCompleted(ticket) {
  const { emitToTicket } = require("../eventBus");
  emitToTicket(ticket.id, "ticket:progress:update", { progress: 100 });
}

/**
 * ------------------------------
 * ROLE / QUEUE EVENTS
 * ------------------------------
 */
async function roleRoomJoined(account) {
  const { emitToRole } = require("../eventBus");
  const { connections } = require("../socket");
  if (!account?.role?.id) return;
  const roleId = account.role.id;
  const roleAccounts = Array.from(connections.values()).filter(
    (c) => c.role?.id === roleId,
  );
  emitToRole(roleId, "role:queue:refresh", { allRoleAccounts: roleAccounts });
}

async function roleRoomLeft(account) {
  const { emitToRole } = require("../eventBus");
  const { connections } = require("../socket");
  if (!account?.role?.id) return;
  const roleId = account.role.id;
  const roleAccounts = Array.from(connections.values()).filter(
    (c) => c.role?.id === roleId,
  );
  emitToRole(roleId, "role:queue:refresh", { allRoleAccounts: roleAccounts });
}

module.exports = {
  // Ticket
  ticketRoomJoined,
  ticketCreated,
  ticketStepChanged,
  ticketCalled,
  ticketCompleted,

  // Role / Queue
  roleRoomJoined,
  roleRoomLeft,
};
