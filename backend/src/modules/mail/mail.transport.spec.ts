import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { LogTransport, SmtpTransport } from './mail.transport';

jest.mock('nodemailer');

describe('LogTransport', () => {
  it('writes the message to the log and sends nothing', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    await new LogTransport().send({ to: 'ann@acme.com', subject: 'Hi', text: 'Body' });

    expect(log).toHaveBeenCalledWith('To ann@acme.com | Hi\nBody');
    log.mockRestore();
  });
});

describe('SmtpTransport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hands the message to the SMTP client from the configured sender', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

    await new SmtpTransport({ host: 'smtp.acme.com', port: 587, from: 'Store <store@acme.com>' }).send({
      to: 'ann@acme.com',
      subject: 'Hi',
      text: 'Body',
    });

    expect(sendMail).toHaveBeenCalledWith({ from: 'Store <store@acme.com>', to: 'ann@acme.com', subject: 'Hi', text: 'Body' });
  });

  it('connects securely on port 465 and signs in only when a user is given', () => {
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail: jest.fn() });

    new SmtpTransport({ host: 'h', port: 465, user: 'u', pass: 'p', from: 'f' });
    new SmtpTransport({ host: 'h', port: 25, from: 'f' });

    expect(nodemailer.createTransport).toHaveBeenNthCalledWith(1, { host: 'h', port: 465, secure: true, auth: { user: 'u', pass: 'p' } });
    expect(nodemailer.createTransport).toHaveBeenNthCalledWith(2, { host: 'h', port: 25, secure: false, auth: undefined });
  });

  it('lets a delivery failure reach the caller', async () => {
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail: jest.fn().mockRejectedValue(new Error('refused')) });

    await expect(
      new SmtpTransport({ host: 'h', port: 25, from: 'f' }).send({ to: 'a@b.com', subject: 's', text: 't' }),
    ).rejects.toThrow('refused');
  });
});
