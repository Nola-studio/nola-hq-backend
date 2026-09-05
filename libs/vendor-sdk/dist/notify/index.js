"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotifyClient = void 0;
class NotifyClient {
    client;
    constructor(client) {
        this.client = client;
    }
    /** Send a notification via the nola-notify service */
    async send(request) {
        const subject = `nola.notifications.${request.channel}`;
        return this.client.request(subject, request);
    }
    /** Send an email notification */
    async sendEmail(to, template, variables) {
        return this.send({ channel: 'email', to, template, variables });
    }
    /** Send an SMS notification */
    async sendSms(to, template, variables) {
        return this.send({ channel: 'sms', to, template, variables });
    }
    /** Send a WhatsApp notification */
    async sendWhatsApp(to, template, variables) {
        return this.send({ channel: 'whatsapp', to, template, variables });
    }
}
exports.NotifyClient = NotifyClient;
//# sourceMappingURL=index.js.map