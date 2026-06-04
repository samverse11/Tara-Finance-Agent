export interface RawTransaction {
  date: string;
  amount: number | string;
  merchant: string;
  category: string;
  description?: string | null;
}

export interface RawNavPoint {
  date: string;
  nav: number | string;
  value?: number | string;
}

export interface RawFund {
  fund_id?: string;
  id?: string;
  name: string;
  type?: string;
  category?: string;
  nav?: RawNavPoint[];
  nav_history?: RawNavPoint[];
}

export interface RawHolding {
  fund_id: string;
  units: number | string;
  purchase_nav: number | string;
  purchase_date?: string | null;
  purchaseNav?: number | string;
  purchaseDate?: string | null;
}
