export class CreatePaymentDto {
  amount!: number;
  method?: string;
  reference?: string;
}
