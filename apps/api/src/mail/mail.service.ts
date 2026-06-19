import { Injectable, Logger } from "@nestjs/common";
import nodemailer from "nodemailer";

@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);
  private readonly from = process.env.MAIL_FROM ?? "CHECK House Inspections <reports@check.test>";
  private readonly transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "localhost",
    port: Number(process.env.SMTP_PORT ?? 1025),
    // true for implicit TLS (port 465); 587 negotiates STARTTLS with secure=false.
    secure: process.env.SMTP_SECURE === "true",
    // Dev default is Mailpit (no auth); set SMTP_USER/PASS for a real provider.
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  });

  async sendReportEmail(to: string, customerName: string, address: string, link: string, lang: "en" | "ar") {
    const subject =
      lang === "ar" ? `تقرير فحص العقار — ${address}` : `Your property inspection report — ${address}`;
    const dir = lang === "ar" ? "rtl" : "ltr";
    const body =
      lang === "ar"
        ? `<p>مرحباً ${customerName}،</p>
           <p>تم إصدار تقرير فحص العقار الخاص بكم: <b>${address}</b>.</p>
           <p><a href="${link}">اضغط هنا لتنزيل التقرير (PDF)</a></p>
           <p>الرابط صالح لمدة ٧ أيام.</p>
           <p>مع التحية،<br/>CHECK House Inspections</p>`
        : `<p>Hello ${customerName},</p>
           <p>The inspection report for your property at <b>${address}</b> is ready.</p>
           <p><a href="${link}">Click here to download the report (PDF)</a></p>
           <p>This link is valid for 7 days.</p>
           <p>Kind regards,<br/>CHECK House Inspections</p>`;

    await this.transport.sendMail({
      from: this.from,
      to,
      subject,
      html: `<div dir="${dir}" style="font-family:sans-serif;line-height:1.7">${body}</div>`,
    });
    this.log.log(`Report email sent to ${to}`);
  }

  /** Notify an inspector they've been assigned to a job (best-effort). */
  async sendAssignmentEmail(
    to: string,
    inspectorName: string,
    address: string,
    dateLabel: string,
    lang: "en" | "ar",
  ) {
    const dir = lang === "ar" ? "rtl" : "ltr";
    const subject = lang === "ar" ? `مهمة فحص جديدة — ${address}` : `New inspection assigned — ${address}`;
    const body =
      lang === "ar"
        ? `<p>مرحباً ${inspectorName}،</p>
           <p>تم تعيينك لفحص العقار: <b>${address}</b>.</p>
           <p>التاريخ المحدد: <b>${dateLabel}</b></p>
           <p>تفقّد قائمة "يومي" في النظام.</p>`
        : `<p>Hello ${inspectorName},</p>
           <p>You've been assigned to inspect: <b>${address}</b>.</p>
           <p>Scheduled for: <b>${dateLabel}</b></p>
           <p>Check "My day" in the platform.</p>`;
    try {
      await this.transport.sendMail({
        from: this.from,
        to,
        subject,
        html: `<div dir="${dir}" style="font-family:sans-serif;line-height:1.7">${body}</div>`,
      });
      this.log.log(`Assignment email sent to ${to}`);
    } catch (e) {
      this.log.warn(`Assignment email to ${to} failed: ${(e as Error).message}`);
    }
  }
}
