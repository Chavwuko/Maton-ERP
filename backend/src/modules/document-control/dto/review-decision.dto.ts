export class ReviewDecisionDto {
  status!: 'APPROVED' | 'REJECTED';
  comment?: string;
}
