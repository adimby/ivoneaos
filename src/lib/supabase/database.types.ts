
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "activities": {
                  Row: {
                    "body": string | null,"contact_id": string,"created_at": string,"deal_id": string | null,"id": string,"kind": Database["public"]['Enums']["activity_kind"],"occurred_at": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"contact_id": string,"created_at"?: string,"deal_id"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["activity_kind"],"occurred_at"?: string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "body"?: string | null,"contact_id"?: string,"created_at"?: string,"deal_id"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["activity_kind"],"occurred_at"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activities_workspace_id_contact_id_fkey"
      columns: ["workspace_id","contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "activities_workspace_id_deal_id_fkey"
      columns: ["workspace_id","deal_id"]
isOneToOne: false
      referencedRelation: "deals"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "activities_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "guarantee_workspaces"
      referencedColumns: ["workspace_id"]
    },{
      foreignKeyName: "activities_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"auth_attempts": {
                  Row: {
                    "at": string,"key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"key": string
                  }
                  Update: {
                    "at"?: string,"key"?: string
                  }
                  Relationships: [
                    
                  ]
                },"contacts": {
                  Row: {
                    "archived_at": string | null,"company_name": string | null,"country": string,"created_at": string,"email": string | null,"id": string,"kind": Database["public"]['Enums']["contact_kind"],"name": string,"phone": string | null,"tags": (string)[],"updated_at": string,"workspace_id": string,"search_text": string | null
                  }
                  ComputedFields: "search_text"
                  Insert: {
                    "archived_at"?: string | null,"company_name"?: string | null,"country"?: string,"created_at"?: string,"email"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["contact_kind"],"name": string,"phone"?: string | null,"tags"?: (string)[],"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "archived_at"?: string | null,"company_name"?: string | null,"country"?: string,"created_at"?: string,"email"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["contact_kind"],"name"?: string,"phone"?: string | null,"tags"?: (string)[],"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contacts_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "guarantee_workspaces"
      referencedColumns: ["workspace_id"]
    },{
      foreignKeyName: "contacts_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"deals": {
                  Row: {
                    "amount": number | null,"archived_at": string | null,"contact_id": string,"created_at": string,"currency": Database["public"]['Enums']["currency"],"expected_close_on": string | null,"id": string,"stage_id": string,"title": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"archived_at"?: string | null,"contact_id": string,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency"],"expected_close_on"?: string | null,"id"?: string,"stage_id": string,"title": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "amount"?: number | null,"archived_at"?: string | null,"contact_id"?: string,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency"],"expected_close_on"?: string | null,"id"?: string,"stage_id"?: string,"title"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deals_workspace_id_contact_id_fkey"
      columns: ["workspace_id","contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "deals_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "guarantee_workspaces"
      referencedColumns: ["workspace_id"]
    },{
      foreignKeyName: "deals_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deals_workspace_id_stage_id_fkey"
      columns: ["workspace_id","stage_id"]
isOneToOne: false
      referencedRelation: "pipeline_stages"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"document_emails": {
                  Row: {
                    "document_id": string,"sent_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "document_id": string,"sent_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "document_id"?: string,"sent_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_emails_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "guarantee_workspaces"
      referencedColumns: ["workspace_id"]
    },{
      foreignKeyName: "document_emails_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"document_lines": {
                  Row: {
                    "created_at": string,"description": string,"id": string,"invoice_id": string | null,"line_total": number,"position": number,"quantity": number,"quote_id": string | null,"unit_price": number,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description": string,"id"?: string,"invoice_id"?: string | null,"line_total"?: number,"position"?: number,"quantity"?: number,"quote_id"?: string | null,"unit_price": number,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"id"?: string,"invoice_id"?: string | null,"line_total"?: number,"position"?: number,"quantity"?: number,"quote_id"?: string | null,"unit_price"?: number,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_lines_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "guarantee_workspaces"
      referencedColumns: ["workspace_id"]
    },{
      foreignKeyName: "document_lines_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "document_lines_workspace_id_invoice_id_fkey"
      columns: ["workspace_id","invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "document_lines_workspace_id_quote_id_fkey"
      columns: ["workspace_id","quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"fiscal_verifications": {
                  Row: {
                    "admins_notified_at": string | null,"back_path": string | null,"created_at": string,"decided_at": string | null,"decided_by": string | null,"front_path": string | null,"id": string,"method": Database["public"]['Enums']["fiscal_method"] | null,"nif": string,"rejection_reason": string | null,"stat": string,"status": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "admins_notified_at"?: string | null,"back_path"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"front_path"?: string | null,"id"?: string,"method"?: Database["public"]['Enums']["fiscal_method"] | null,"nif": string,"rejection_reason"?: string | null,"stat": string,"status"?: string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "admins_notified_at"?: string | null,"back_path"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"front_path"?: string | null,"id"?: string,"method"?: Database["public"]['Enums']["fiscal_method"] | null,"nif"?: string,"rejection_reason"?: string | null,"stat"?: string,"status"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fiscal_verifications_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "guarantee_workspaces"
      referencedColumns: ["workspace_id"]
    },{
      foreignKeyName: "fiscal_verifications_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"invoices": {
                  Row: {
                    "amount_paid": number,"contact_id": string,"created_at": string,"currency": Database["public"]['Enums']["currency"],"discount": number,"due_on": string | null,"exchange_rate": number,"id": string,"issued_on": string | null,"language": Database["public"]['Enums']["locale"],"number": string | null,"paid_at": string | null,"pdf_path": string | null,"public_token": string,"quote_id": string | null,"sent_at": string | null,"snapshot": Json | null,"status": Database["public"]['Enums']["invoice_status"],"subtotal": number,"total": number,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paid"?: number,"contact_id": string,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency"],"discount"?: number,"due_on"?: string | null,"exchange_rate"?: number,"id"?: string,"issued_on"?: string | null,"language"?: Database["public"]['Enums']["locale"],"number"?: string | null,"paid_at"?: string | null,"pdf_path"?: string | null,"public_token"?: string,"quote_id"?: string | null,"sent_at"?: string | null,"snapshot"?: Json | null,"status"?: Database["public"]['Enums']["invoice_status"],"subtotal"?: number,"total"?: number,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "amount_paid"?: number,"contact_id"?: string,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency"],"discount"?: number,"due_on"?: string | null,"exchange_rate"?: number,"id"?: string,"issued_on"?: string | null,"language"?: Database["public"]['Enums']["locale"],"number"?: string | null,"paid_at"?: string | null,"pdf_path"?: string | null,"public_token"?: string,"quote_id"?: string | null,"sent_at"?: string | null,"snapshot"?: Json | null,"status"?: Database["public"]['Enums']["invoice_status"],"subtotal"?: number,"total"?: number,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_workspace_id_contact_id_fkey"
      columns: ["workspace_id","contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "invoices_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "guarantee_workspaces"
      referencedColumns: ["workspace_id"]
    },{
      foreignKeyName: "invoices_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_workspace_id_quote_id_fkey"
      columns: ["workspace_id","quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"number_sequences": {
                  Row: {
                    "created_at": string,"doc_type": Database["public"]['Enums']["doc_type"],"id": string,"last_value": number,"updated_at": string,"workspace_id": string,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"doc_type": Database["public"]['Enums']["doc_type"],"id"?: string,"last_value"?: number,"updated_at"?: string,"workspace_id": string,"year": number
                  }
                  Update: {
                    "created_at"?: string,"doc_type"?: Database["public"]['Enums']["doc_type"],"id"?: string,"last_value"?: number,"updated_at"?: string,"workspace_id"?: string,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "number_sequences_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "guarantee_workspaces"
      referencedColumns: ["workspace_id"]
    },{
      foreignKeyName: "number_sequences_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"onboarding_answers": {
                  Row: {
                    "answers": NonNullable<Json>,"completed_at": string | null,"created_at": string,"id": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answers"?: NonNullable<Json>,"completed_at"?: string | null,"created_at"?: string,"id"?: string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "answers"?: NonNullable<Json>,"completed_at"?: string | null,"created_at"?: string,"id"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "onboarding_answers_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: true
      referencedRelation: "guarantee_workspaces"
      referencedColumns: ["workspace_id"]
    },{
      foreignKeyName: "onboarding_answers_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: true
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_accounts": {
                  Row: {
                    "created_at": string,"encrypted_api_key": string | null,"encrypted_signing_secret": string | null,"external_account_id": string | null,"id": string,"last_checked_at": string | null,"manual_instructions": string | null,"provider": Database["public"]['Enums']["payment_provider"],"status": Database["public"]['Enums']["payment_account_status"],"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"encrypted_api_key"?: string | null,"encrypted_signing_secret"?: string | null,"external_account_id"?: string | null,"id"?: string,"last_checked_at"?: string | null,"manual_instructions"?: string | null,"provider": Database["public"]['Enums']["payment_provider"],"status"?: Database["public"]['Enums']["payment_account_status"],"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"encrypted_api_key"?: string | null,"encrypted_signing_secret"?: string | null,"external_account_id"?: string | null,"id"?: string,"last_checked_at"?: string | null,"manual_instructions"?: string | null,"provider"?: Database["public"]['Enums']["payment_provider"],"status"?: Database["public"]['Enums']["payment_account_status"],"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_accounts_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "guarantee_workspaces"
      referencedColumns: ["workspace_id"]
    },{
      foreignKeyName: "payment_accounts_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_links": {
                  Row: {
                    "amount": number | null,"created_at": string,"encrypted_api_key": string | null,"encrypted_signing_secret": string | null,"expires_at": string | null,"id": string,"invoice_id": string,"last_checked_at": string | null,"last_error": string | null,"merchant_reference": string,"notification_token": string | null,"payment_account_id": string,"provider": Database["public"]['Enums']["payment_provider"],"provider_link_id": string | null,"provider_url": string | null,"status": Database["public"]['Enums']["payment_link_status"],"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"created_at"?: string,"encrypted_api_key"?: string | null,"encrypted_signing_secret"?: string | null,"expires_at"?: string | null,"id"?: string,"invoice_id": string,"last_checked_at"?: string | null,"last_error"?: string | null,"merchant_reference": string,"notification_token"?: string | null,"payment_account_id": string,"provider": Database["public"]['Enums']["payment_provider"],"provider_link_id"?: string | null,"provider_url"?: string | null,"status"?: Database["public"]['Enums']["payment_link_status"],"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "amount"?: number | null,"created_at"?: string,"encrypted_api_key"?: string | null,"encrypted_signing_secret"?: string | null,"expires_at"?: string | null,"id"?: string,"invoice_id"?: string,"last_checked_at"?: string | null,"last_error"?: string | null,"merchant_reference"?: string,"notification_token"?: string | null,"payment_account_id"?: string,"provider"?: Database["public"]['Enums']["payment_provider"],"provider_link_id"?: string | null,"provider_url"?: string | null,"status"?: Database["public"]['Enums']["payment_link_status"],"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_links_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "guarantee_workspaces"
      referencedColumns: ["workspace_id"]
    },{
      foreignKeyName: "payment_links_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_links_workspace_id_invoice_id_fkey"
      columns: ["workspace_id","invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "payment_links_workspace_id_payment_account_id_fkey"
      columns: ["workspace_id","payment_account_id"]
isOneToOne: false
      referencedRelation: "payment_accounts"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"created_at": string,"currency": Database["public"]['Enums']["currency"],"fee": number,"id": string,"invoice_id": string,"method": Database["public"]['Enums']["payment_method"],"paid_at": string,"payment_link_id": string | null,"provider": Database["public"]['Enums']["payment_provider"],"provider_reference": string | null,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"currency": Database["public"]['Enums']["currency"],"fee"?: number,"id"?: string,"invoice_id": string,"method": Database["public"]['Enums']["payment_method"],"paid_at"?: string,"payment_link_id"?: string | null,"provider": Database["public"]['Enums']["payment_provider"],"provider_reference"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency"],"fee"?: number,"id"?: string,"invoice_id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"paid_at"?: string,"payment_link_id"?: string | null,"provider"?: Database["public"]['Enums']["payment_provider"],"provider_reference"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "guarantee_workspaces"
      referencedColumns: ["workspace_id"]
    },{
      foreignKeyName: "payments_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_workspace_id_invoice_id_fkey"
      columns: ["workspace_id","invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "payments_workspace_id_payment_link_id_fkey"
      columns: ["workspace_id","payment_link_id"]
isOneToOne: false
      referencedRelation: "payment_links"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"pipeline_stages": {
                  Row: {
                    "created_at": string,"id": string,"kind": Database["public"]['Enums']["stage_kind"],"name": string,"position": number,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["stage_kind"],"name": string,"position": number,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["stage_kind"],"name"?: string,"position"?: number,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pipeline_stages_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "guarantee_workspaces"
      referencedColumns: ["workspace_id"]
    },{
      foreignKeyName: "pipeline_stages_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_admins": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"full_name": string | null,"locale": Database["public"]['Enums']["locale"],"phone": string | null,"theme_mode": string,"theme_palette": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"full_name"?: string | null,"locale"?: Database["public"]['Enums']["locale"],"phone"?: string | null,"theme_mode"?: string,"theme_palette"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"full_name"?: string | null,"locale"?: Database["public"]['Enums']["locale"],"phone"?: string | null,"theme_mode"?: string,"theme_palette"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"quotes": {
                  Row: {
                    "accepted_at": string | null,"contact_id": string,"created_at": string,"currency": Database["public"]['Enums']["currency"],"deal_id": string | null,"discount": number,"id": string,"language": Database["public"]['Enums']["locale"],"number": string | null,"pdf_path": string | null,"public_token": string,"sent_at": string | null,"snapshot": Json | null,"status": Database["public"]['Enums']["quote_status"],"subtotal": number,"total": number,"updated_at": string,"valid_until": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"contact_id": string,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency"],"deal_id"?: string | null,"discount"?: number,"id"?: string,"language"?: Database["public"]['Enums']["locale"],"number"?: string | null,"pdf_path"?: string | null,"public_token"?: string,"sent_at"?: string | null,"snapshot"?: Json | null,"status"?: Database["public"]['Enums']["quote_status"],"subtotal"?: number,"total"?: number,"updated_at"?: string,"valid_until"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"contact_id"?: string,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency"],"deal_id"?: string | null,"discount"?: number,"id"?: string,"language"?: Database["public"]['Enums']["locale"],"number"?: string | null,"pdf_path"?: string | null,"public_token"?: string,"sent_at"?: string | null,"snapshot"?: Json | null,"status"?: Database["public"]['Enums']["quote_status"],"subtotal"?: number,"total"?: number,"updated_at"?: string,"valid_until"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quotes_workspace_id_contact_id_fkey"
      columns: ["workspace_id","contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "quotes_workspace_id_deal_id_fkey"
      columns: ["workspace_id","deal_id"]
isOneToOne: false
      referencedRelation: "deals"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "quotes_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "guarantee_workspaces"
      referencedColumns: ["workspace_id"]
    },{
      foreignKeyName: "quotes_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"reminders": {
                  Row: {
                    "contact_id": string | null,"created_at": string,"deal_id": string | null,"done_at": string | null,"due_at": string,"id": string,"notified_at": string | null,"notify_attempts": number,"notify_claimed_at": string | null,"title": string,"updated_at": string,"workspace_id": string,"about_active": boolean | null
                  }
                  ComputedFields: "about_active"
                  Insert: {
                    "contact_id"?: string | null,"created_at"?: string,"deal_id"?: string | null,"done_at"?: string | null,"due_at": string,"id"?: string,"notified_at"?: string | null,"notify_attempts"?: number,"notify_claimed_at"?: string | null,"title": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "contact_id"?: string | null,"created_at"?: string,"deal_id"?: string | null,"done_at"?: string | null,"due_at"?: string,"id"?: string,"notified_at"?: string | null,"notify_attempts"?: number,"notify_claimed_at"?: string | null,"title"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminders_workspace_id_contact_id_fkey"
      columns: ["workspace_id","contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "reminders_workspace_id_deal_id_fkey"
      columns: ["workspace_id","deal_id"]
isOneToOne: false
      referencedRelation: "deals"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "reminders_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "guarantee_workspaces"
      referencedColumns: ["workspace_id"]
    },{
      foreignKeyName: "reminders_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"webhook_events": {
                  Row: {
                    "created_at": string,"error": string | null,"id": string,"payload": Json | null,"processed_at": string | null,"provider": Database["public"]['Enums']["payment_provider"],"raw_body": string,"signature_valid": boolean | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"error"?: string | null,"id"?: string,"payload"?: Json | null,"processed_at"?: string | null,"provider": Database["public"]['Enums']["payment_provider"],"raw_body": string,"signature_valid"?: boolean | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"error"?: string | null,"id"?: string,"payload"?: Json | null,"processed_at"?: string | null,"provider"?: Database["public"]['Enums']["payment_provider"],"raw_body"?: string,"signature_valid"?: boolean | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"workspace_members": {
                  Row: {
                    "created_at": string,"id": string,"role": Database["public"]['Enums']["member_role"],"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"role"?: Database["public"]['Enums']["member_role"],"updated_at"?: string,"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"role"?: Database["public"]['Enums']["member_role"],"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_members_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "guarantee_workspaces"
      referencedColumns: ["workspace_id"]
    },{
      foreignKeyName: "workspace_members_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspaces": {
                  Row: {
                    "address": string | null,"brand_accent_color": string,"brand_banner_path": string | null,"brand_font": string,"brand_logo_position": string,"brand_logo_size": string,"brand_primary_color": string,"brand_show_logo": boolean,"created_at": string,"default_currency": Database["public"]['Enums']["currency"],"fiscal_rejection_reason": string | null,"fiscal_status": Database["public"]['Enums']["fiscal_status"],"fiscal_status_at": string | null,"id": string,"invoice_footer": string | null,"level": Database["public"]['Enums']["workspace_level"],"logo_path": string | null,"name": string,"nif": string | null,"onboarded_at": string | null,"plan": Database["public"]['Enums']["plan"],"profile_completed_at": string | null,"stat": string | null,"tax_regime": Database["public"]['Enums']["tax_regime"] | null,"trade": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"brand_accent_color"?: string,"brand_banner_path"?: string | null,"brand_font"?: string,"brand_logo_position"?: string,"brand_logo_size"?: string,"brand_primary_color"?: string,"brand_show_logo"?: boolean,"created_at"?: string,"default_currency"?: Database["public"]['Enums']["currency"],"fiscal_rejection_reason"?: string | null,"fiscal_status"?: Database["public"]['Enums']["fiscal_status"],"fiscal_status_at"?: string | null,"id"?: string,"invoice_footer"?: string | null,"level"?: Database["public"]['Enums']["workspace_level"],"logo_path"?: string | null,"name": string,"nif"?: string | null,"onboarded_at"?: string | null,"plan"?: Database["public"]['Enums']["plan"],"profile_completed_at"?: string | null,"stat"?: string | null,"tax_regime"?: Database["public"]['Enums']["tax_regime"] | null,"trade"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"brand_accent_color"?: string,"brand_banner_path"?: string | null,"brand_font"?: string,"brand_logo_position"?: string,"brand_logo_size"?: string,"brand_primary_color"?: string,"brand_show_logo"?: boolean,"created_at"?: string,"default_currency"?: Database["public"]['Enums']["currency"],"fiscal_rejection_reason"?: string | null,"fiscal_status"?: Database["public"]['Enums']["fiscal_status"],"fiscal_status_at"?: string | null,"id"?: string,"invoice_footer"?: string | null,"level"?: Database["public"]['Enums']["workspace_level"],"logo_path"?: string | null,"name"?: string,"nif"?: string | null,"onboarded_at"?: string | null,"plan"?: Database["public"]['Enums']["plan"],"profile_completed_at"?: string | null,"stat"?: string | null,"tax_regime"?: Database["public"]['Enums']["tax_regime"] | null,"trade"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "guarantee_weekly": {
                  Row: {
                    "invoices_sent": number | null,"prospects_contacted": number | null,"quotes_sent": number | null,"touchpoints": number | null,"week_start": string | null,"workspace_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"guarantee_workspaces": {
                  Row: {
                    "first_quote_sent_at": string | null,"invoices_sent": number | null,"name": string | null,"owner_id": string | null,"plan": Database["public"]['Enums']["plan"] | null,"profile_completed_at": string | null,"quotes_sent": number | null,"signed_up_at": string | null,"workspace_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "about_active":
{ Args: { "": Database["public"]['Tables']["reminders"]['Row'] }; Returns: { error: true } & "the function public.about_active with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
                           },
"accept_quote":
{ Args: { "token": string,"version": string }; Returns: string
                           },
"admin_decide_fiscal_verification":
{ Args: { "p_reason"?: string,"p_request_id": string,"p_verified": boolean }; Returns: {
              "back_path": string,"front_path": string,"owner_email": string,"owner_locale": string,"workspace_id": string,"workspace_name": string
            }[]
                           },
"admin_fiscal_history":
{ Args: { "p_limit"?: number }; Returns: {
              "decided_at": string,"decided_by_email": string,"id": string,"method": Database["public"]['Enums']["fiscal_method"],"rejection_reason": string,"status": string,"workspace_name": string
            }[]
                           },
"admin_fiscal_queue":
{ Args: Record<PropertyKey, never>; Returns: {
              "back_path": string,"created_at": string,"front_path": string,"id": string,"nif": string,"stat": string,"workspace_id": string,"workspace_name": string
            }[]
                           },
"auth_rate_limit":
{ Args: { "p_key": string,"p_max": number,"p_window_seconds": number }; Returns: boolean
                           },
"auth_rate_limit_release":
{ Args: { "p_key": string }; Returns: undefined
                           },
"claim_document_email":
{ Args: { "p_document_id": string }; Returns: string
                           },
"claim_due_reminders":
{ Args: { "p_cutoff": string,"p_lease"?: string,"p_limit"?: number }; Returns: {
              "claimed_at": string,"contact_name": string,"deal_title": string,"due_at": string,"id": string,"title": string,"workspace_id": string
            }[]
                           },
"contact_top_countries":
{ Args: { "p_workspace_id": string }; Returns: {
              "contacts": number,"country": string
            }[]
                           },
"create_invoice_from_quote":
{ Args: { "p_quote_id": string }; Returns: string
                           },
"create_workspace":
{ Args: { "default_currency"?: Database["public"]['Enums']["currency"],"name": string,"trade"?: string }; Returns: string
                           },
"dashboard_invoice_totals":
{ Args: { "p_workspace_id": string }; Returns: {
              "amount": number,"currency": Database["public"]['Enums']["currency"],"exchange_rate": number,"item_count": number,"kind": string,"overdue": boolean
            }[]
                           },
"decide_fiscal_verification":
{ Args: { "p_admin"?: string,"p_method": Database["public"]['Enums']["fiscal_method"],"p_reason"?: string,"p_request_id": string,"p_verified": boolean }; Returns: {
              "back_path": string,"front_path": string,"owner_email": string,"owner_locale": string,"workspace_id": string,"workspace_name": string
            }[]
                           },
"document_public_lines":
{ Args: { "p_invoice_id": string,"p_quote_id": string }; Returns: Json
                           },
"document_snapshot":
{ Args: { "p_contact_id": string,"p_workspace_id": string }; Returns: Json
                           },
"fiscal_upload_workspace_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"flag_whop_link":
{ Args: { "p_checkout_id": string,"p_error": string,"p_merchant_reference": string }; Returns: boolean
                           },
"generate_public_token":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"get_public_invoice":
{ Args: { "token": string }; Returns: Json
                           },
"get_public_quote":
{ Args: { "token": string }; Returns: Json
                           },
"is_member":
{ Args: { "workspace_id": string }; Returns: boolean
                           },
"is_platform_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_public_logo":
{ Args: { "object_name": string }; Returns: boolean
                           },
"mark_reminders_notified":
{ Args: { "p_claimed_at": string,"p_ids": (string)[] }; Returns: number
                           },
"my_workspace_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"next_document_number":
{ Args: { "p_doc_type": Database["public"]['Enums']["doc_type"],"p_workspace_id": string }; Returns: string
                           },
"pipeline_totals":
{ Args: { "p_workspace_id": string }; Returns: {
              "amount_sum": number,"currency": Database["public"]['Enums']["currency"],"deal_count": number,"stage_id": string
            }[]
                           },
"plan_usage":
{ Args: { "p_workspace_id": string }; Returns: {
              "active_contacts": number,"documents_this_month": number
            }[]
                           },
"platform_admin_emails":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"public_document_exists":
{ Args: { "token": string }; Returns: boolean
                           },
"quote_version":
{ Args: { "p_quote_id": string }; Returns: string
                           },
"record_papi_payment":
{ Args: { "p_amount": number,"p_fee": number,"p_merchant_reference": string,"p_method": Database["public"]['Enums']["payment_method"],"p_paid_at"?: string,"p_provider_reference": string }; Returns: string
                           },
"record_whop_payment":
{ Args: { "p_account_id": string,"p_amount": number,"p_checkout_id": string,"p_currency": Database["public"]['Enums']["currency"],"p_fee": number,"p_merchant_reference": string,"p_paid_at"?: string,"p_provider_reference": string }; Returns: string
                           },
"release_document_email":
{ Args: { "p_claimed_at": string,"p_document_id": string }; Returns: undefined
                           },
"release_reminders":
{ Args: { "p_claimed_at": string,"p_failed": boolean,"p_ids": (string)[] }; Returns: string[]
                           },
"require_platform_admin":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"save_invoice":
{ Args: { "p_contact_id": string,"p_currency": Database["public"]['Enums']["currency"],"p_discount": number,"p_due_on": string,"p_exchange_rate": number,"p_id"?: string,"p_language": Database["public"]['Enums']["locale"],"p_lines": Json,"p_workspace_id": string }; Returns: string
                           },
"save_quote":
{ Args: { "p_contact_id": string,"p_currency": Database["public"]['Enums']["currency"],"p_deal_id"?: string,"p_discount": number,"p_id"?: string,"p_language": Database["public"]['Enums']["locale"],"p_lines": Json,"p_valid_until": string,"p_workspace_id": string }; Returns: string
                           },
"search_text":
{ Args: { "": Database["public"]['Tables']["contacts"]['Row'] }; Returns: { error: true } & "the function public.search_text with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
                           },
"stage_document_lines":
{ Args: { "p_invoice_id": string,"p_lines": Json,"p_quote_id": string,"p_workspace_id": string }; Returns: (string)[]
                           },
"submit_fiscal_verification":
{ Args: { "p_back_path": string,"p_front_path": string,"p_workspace_id": string }; Returns: string
                           }
          }
          Enums: {
            "activity_kind": "note"|"call"|"whatsapp"|"email"|"meeting","contact_kind": "person"|"company","currency": "MGA"|"EUR"|"USD","doc_type": "quote"|"invoice","fiscal_method": "automatic"|"manual","fiscal_status": "unverified"|"pending"|"verified"|"rejected","invoice_status": "draft"|"sent"|"paid"|"overdue"|"cancelled","locale": "fr"|"en","member_role": "owner"|"member","payment_account_status": "pending"|"connected"|"error"|"disabled","payment_link_status": "active"|"paid"|"expired"|"failed"|"cancelled","payment_method": "MVOLA"|"ORANGE_MONEY"|"AIRTEL_MONEY"|"CARD"|"manual","payment_provider": "papi"|"whop"|"manual","plan": "decouverte"|"lancement"|"premier_client"|"contrat_signe","quote_status": "draft"|"sent"|"accepted"|"declined"|"expired","stage_kind": "open"|"won"|"lost","tax_regime": "tva"|"impot_synthetique","workspace_level": "lancer"|"remplir"|"grandir"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "activity_kind": ["note", "call", "whatsapp", "email", "meeting"],"contact_kind": ["person", "company"],"currency": ["MGA", "EUR", "USD"],"doc_type": ["quote", "invoice"],"fiscal_method": ["automatic", "manual"],"fiscal_status": ["unverified", "pending", "verified", "rejected"],"invoice_status": ["draft", "sent", "paid", "overdue", "cancelled"],"locale": ["fr", "en"],"member_role": ["owner", "member"],"payment_account_status": ["pending", "connected", "error", "disabled"],"payment_link_status": ["active", "paid", "expired", "failed", "cancelled"],"payment_method": ["MVOLA", "ORANGE_MONEY", "AIRTEL_MONEY", "CARD", "manual"],"payment_provider": ["papi", "whop", "manual"],"plan": ["decouverte", "lancement", "premier_client", "contrat_signe"],"quote_status": ["draft", "sent", "accepted", "declined", "expired"],"stage_kind": ["open", "won", "lost"],"tax_regime": ["tva", "impot_synthetique"],"workspace_level": ["lancer", "remplir", "grandir"]
          }
        }
} as const
