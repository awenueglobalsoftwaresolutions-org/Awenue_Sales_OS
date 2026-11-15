import { supabase } from '../lib/supabase'

const run = async (q) => { const { data, error } = await q; if (error) throw error; return data }

export const listProfiles = () => run(supabase.from('profiles').select('id,full_name,email,role').eq('is_active', true).order('full_name'))
export const listServiceNames = () => run(supabase.from('services').select('name').eq('is_active', true).order('sort_order'))
export const listOrganizationOptions = () => run(supabase.from('organizations').select('id,name').order('name').limit(1000))
export const listLeadOptions = () => run(supabase.from('leads').select('id,lead_number,first_name,last_name').order('created_at', { ascending: false }).limit(500))
export const listContactOptions = () => run(supabase.from('contacts').select('id,first_name,last_name').order('first_name').limit(500))
export const listDealOptions = () => run(supabase.from('deals').select('id,title').order('created_at', { ascending: false }).limit(500))
