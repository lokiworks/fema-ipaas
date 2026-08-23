import {
  ConnectorAuth,
  Property,
  createAction,
} from '@fema/connector-sdk';
import { multiplicationActionOutputSchema } from '../output-schemas';

export const multiplication = createAction({
  audience: 'both',
  name: 'multiplication_math',
  classification: 'READ',
  outputSchema: multiplicationActionOutputSchema,
  auth: ConnectorAuth.None(),
  displayName: 'Multiplication',
  description: 'Multiply first number by the second number',
  aiMetadata: { description: 'Compute the product of exactly two numbers, returning first_number * second_number. Pick this for a two-operand multiplication, including percentage or unit-rate scaling (e.g. an amount times 0.15); use the sibling Addition, Subtraction, Division, or Modulo actions for other operations, and the Code connector for exponents or multi-term formulas. Both operands are required and must be numeric; read-only and idempotent, with no external side effects.', idempotent: true },
  errorHandlingOptions: {
    continueOnFailure: {
      hide: true,
    },
    retryOnFailure: {
      hide: true,
    },
  },
  props: {
    first_number: Property.Number({
      displayName: 'First Number',
      description: undefined,
      required: true,
    }),
    second_number: Property.Number({
      displayName: 'Second Number',
      description: undefined,
      required: true,
    }),
  },
  async run(context) {
    return (
      context.propsValue['first_number'] * context.propsValue['second_number']
    );
  },
});
