
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
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"contacts": {
                  Row: {
                    "archived_at": string | null,"company_name": string | null,"country": string,"created_at": string,"email": string | null,"id": string,"kind": Database["public"]['Enums']["contact_kind"],"name": string,"phone": string | null,"tags": (string)[],"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
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
                },"invoices": {
                  Row: {
                    "amount_paid": number,"contact_id": string,"created_at": string,"currency": Database["public"]['Enums']["currency"],"discount": number,"due_on": string | null,"exchange_rate": number,"id": string,"issued_on": string | null,"number": string | null,"paid_at": string | null,"pdf_path": string | null,"public_token": string,"quote_id": string | null,"sent_at": string | null,"snapshot": Json | null,"status": Database["public"]['Enums']["invoice_status"],"subtotal": number,"total": number,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paid"?: number,"contact_id": string,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency"],"discount"?: number,"due_on"?: string | null,"exchange_rate"?: number,"id"?: string,"issued_on"?: string | null,"number"?: string | null,"paid_at"?: string | null,"pdf_path"?: string | null,"public_token"?: string,"quote_id"?: string | null,"sent_at"?: string | null,"snapshot"?: Json | null,"status"?: Database["public"]['Enums']["invoice_status"],"subtotal"?: number,"total"?: number,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "amount_paid"?: number,"contact_id"?: string,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency"],"discount"?: number,"due_on"?: string | null,"exchange_rate"?: number,"id"?: string,"issued_on"?: string | null,"number"?: string | null,"paid_at"?: string | null,"pdf_path"?: string | null,"public_token"?: string,"quote_id"?: string | null,"sent_at"?: string | null,"snapshot"?: Json | null,"status"?: Database["public"]['Enums']["invoice_status"],"subtotal"?: number,"total"?: number,"updated_at"?: string,"workspace_id"?: string
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
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_links": {
                  Row: {
                    "created_at": string,"expires_at": string | null,"id": string,"invoice_id": string,"merchant_reference": string,"notification_token": string | null,"payment_account_id": string,"provider": Database["public"]['Enums']["payment_provider"],"provider_url": string | null,"status": Database["public"]['Enums']["payment_link_status"],"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string | null,"id"?: string,"invoice_id": string,"merchant_reference": string,"notification_token"?: string | null,"payment_account_id": string,"provider": Database["public"]['Enums']["payment_provider"],"provider_url"?: string | null,"status"?: Database["public"]['Enums']["payment_link_status"],"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string | null,"id"?: string,"invoice_id"?: string,"merchant_reference"?: string,"notification_token"?: string | null,"payment_account_id"?: string,"provider"?: Database["public"]['Enums']["payment_provider"],"provider_url"?: string | null,"status"?: Database["public"]['Enums']["payment_link_status"],"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
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
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"full_name": string | null,"locale": Database["public"]['Enums']["locale"],"phone": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"full_name"?: string | null,"locale"?: Database["public"]['Enums']["locale"],"phone"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"full_name"?: string | null,"locale"?: Database["public"]['Enums']["locale"],"phone"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"quotes": {
                  Row: {
                    "accepted_at": string | null,"contact_id": string,"created_at": string,"currency": Database["public"]['Enums']["currency"],"deal_id": string | null,"discount": number,"id": string,"number": string | null,"pdf_path": string | null,"public_token": string,"sent_at": string | null,"snapshot": Json | null,"status": Database["public"]['Enums']["quote_status"],"subtotal": number,"total": number,"updated_at": string,"valid_until": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"contact_id": string,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency"],"deal_id"?: string | null,"discount"?: number,"id"?: string,"number"?: string | null,"pdf_path"?: string | null,"public_token"?: string,"sent_at"?: string | null,"snapshot"?: Json | null,"status"?: Database["public"]['Enums']["quote_status"],"subtotal"?: number,"total"?: number,"updated_at"?: string,"valid_until"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"contact_id"?: string,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency"],"deal_id"?: string | null,"discount"?: number,"id"?: string,"number"?: string | null,"pdf_path"?: string | null,"public_token"?: string,"sent_at"?: string | null,"snapshot"?: Json | null,"status"?: Database["public"]['Enums']["quote_status"],"subtotal"?: number,"total"?: number,"updated_at"?: string,"valid_until"?: string | null,"workspace_id"?: string
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
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"reminders": {
                  Row: {
                    "contact_id": string | null,"created_at": string,"deal_id": string | null,"done_at": string | null,"due_at": string,"id": string,"notified_at": string | null,"title": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "contact_id"?: string | null,"created_at"?: string,"deal_id"?: string | null,"done_at"?: string | null,"due_at": string,"id"?: string,"notified_at"?: string | null,"title": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "contact_id"?: string | null,"created_at"?: string,"deal_id"?: string | null,"done_at"?: string | null,"due_at"?: string,"id"?: string,"notified_at"?: string | null,"title"?: string,"updated_at"?: string,"workspace_id"?: string
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
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspaces": {
                  Row: {
                    "address": string | null,"created_at": string,"default_currency": Database["public"]['Enums']["currency"],"id": string,"invoice_footer": string | null,"level": Database["public"]['Enums']["workspace_level"],"logo_path": string | null,"name": string,"nif": string | null,"plan": Database["public"]['Enums']["plan"],"profile_completed_at": string | null,"stat": string | null,"tax_regime": Database["public"]['Enums']["tax_regime"] | null,"trade": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"created_at"?: string,"default_currency"?: Database["public"]['Enums']["currency"],"id"?: string,"invoice_footer"?: string | null,"level"?: Database["public"]['Enums']["workspace_level"],"logo_path"?: string | null,"name": string,"nif"?: string | null,"plan"?: Database["public"]['Enums']["plan"],"profile_completed_at"?: string | null,"stat"?: string | null,"tax_regime"?: Database["public"]['Enums']["tax_regime"] | null,"trade"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"created_at"?: string,"default_currency"?: Database["public"]['Enums']["currency"],"id"?: string,"invoice_footer"?: string | null,"level"?: Database["public"]['Enums']["workspace_level"],"logo_path"?: string | null,"name"?: string,"nif"?: string | null,"plan"?: Database["public"]['Enums']["plan"],"profile_completed_at"?: string | null,"stat"?: string | null,"tax_regime"?: Database["public"]['Enums']["tax_regime"] | null,"trade"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_quote":
{ Args: { "token": string,"version": string }; Returns: string
                           },
"create_workspace":
{ Args: { "default_currency"?: Database["public"]['Enums']["currency"],"name": string,"trade"?: string }; Returns: string
                           },
"document_public_lines":
{ Args: { "p_invoice_id": string,"p_quote_id": string }; Returns: Json
                           },
"document_snapshot":
{ Args: { "p_contact_id": string,"p_workspace_id": string }; Returns: Json
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
"is_public_logo":
{ Args: { "object_name": string }; Returns: boolean
                           },
"my_workspace_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"next_document_number":
{ Args: { "p_doc_type": Database["public"]['Enums']["doc_type"],"p_workspace_id": string }; Returns: string
                           },
"quote_version":
{ Args: { "p_quote_id": string }; Returns: string
                           }
          }
          Enums: {
            "activity_kind": "note"|"call"|"whatsapp"|"email"|"meeting","contact_kind": "person"|"company","currency": "MGA"|"EUR"|"USD","doc_type": "quote"|"invoice","invoice_status": "draft"|"sent"|"paid"|"overdue"|"cancelled","locale": "fr"|"en","member_role": "owner"|"member","payment_account_status": "pending"|"connected"|"error"|"disabled","payment_link_status": "active"|"paid"|"expired"|"failed"|"cancelled","payment_method": "MVOLA"|"ORANGE_MONEY"|"AIRTEL_MONEY"|"CARD"|"manual","payment_provider": "papi"|"whop"|"manual","plan": "decouverte"|"lancement"|"premier_client"|"contrat_signe","quote_status": "draft"|"sent"|"accepted"|"declined"|"expired","stage_kind": "open"|"won"|"lost","tax_regime": "tva"|"impot_synthetique","workspace_level": "lancer"|"remplir"|"grandir"
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
            "activity_kind": ["note", "call", "whatsapp", "email", "meeting"],"contact_kind": ["person", "company"],"currency": ["MGA", "EUR", "USD"],"doc_type": ["quote", "invoice"],"invoice_status": ["draft", "sent", "paid", "overdue", "cancelled"],"locale": ["fr", "en"],"member_role": ["owner", "member"],"payment_account_status": ["pending", "connected", "error", "disabled"],"payment_link_status": ["active", "paid", "expired", "failed", "cancelled"],"payment_method": ["MVOLA", "ORANGE_MONEY", "AIRTEL_MONEY", "CARD", "manual"],"payment_provider": ["papi", "whop", "manual"],"plan": ["decouverte", "lancement", "premier_client", "contrat_signe"],"quote_status": ["draft", "sent", "accepted", "declined", "expired"],"stage_kind": ["open", "won", "lost"],"tax_regime": ["tva", "impot_synthetique"],"workspace_level": ["lancer", "remplir", "grandir"]
          }
        }
} as const
