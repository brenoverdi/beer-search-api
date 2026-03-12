import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.EMAIL_FROM || 'Beer Search <onboarding@resend.dev>';

export const sendOtpEmail = async (to: string, code: string): Promise<void> => {
  await resend.emails.send({
    from: FROM,
    to,
    subject: '🍺 Beer Search — verify your email',
    text: `Your verification code is: ${code}\n\nIt expires in 10 minutes.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>Verify your email</h2>
        <p>Use the code below to confirm your Beer Search account:</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;padding:16px;background:#f3f4f6;border-radius:8px;text-align:center">
          ${code}
        </div>
        <p style="color:#6b7280;font-size:14px">Expires in 10 minutes. If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
};
