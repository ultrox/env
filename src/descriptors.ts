export class StringDescriptor {
  readonly type = "string" as const;
  readonly isRequired: boolean;
  readonly minLen: number | undefined;
  readonly maxLen: number | undefined;

  constructor(isRequired: boolean, minLen?: number, maxLen?: number) {
    this.isRequired = isRequired;
    this.minLen = minLen;
    this.maxLen = maxLen;
  }

  min(n: number): StringDescriptor {
    return new StringDescriptor(this.isRequired, n, this.maxLen);
  }

  max(n: number): StringDescriptor {
    return new StringDescriptor(this.isRequired, this.minLen, n);
  }
}

export class NumberDescriptor {
  readonly type = "number" as const;
  readonly minVal: number | undefined;
  readonly maxVal: number | undefined;

  constructor(minVal?: number, maxVal?: number) {
    this.minVal = minVal;
    this.maxVal = maxVal;
  }

  min(n: number): NumberDescriptor {
    return new NumberDescriptor(n, this.maxVal);
  }

  max(n: number): NumberDescriptor {
    return new NumberDescriptor(this.minVal, n);
  }
}

export class BooleanDescriptor {
  readonly type = "boolean" as const;
}

export type Descriptor = StringDescriptor | NumberDescriptor | BooleanDescriptor;

export const required = new StringDescriptor(true, 1);
export const optional = new StringDescriptor(false);
export const number = new NumberDescriptor();
export const boolean = new BooleanDescriptor();
