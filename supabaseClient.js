import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://qlpuxafdmyckbjdjqehv.supabase.co'
const supabaseKey = 'sb_publishable_1rp4OzJlTzr-rK3IhU9jig_2M44_W8Y'

export const supabase = createClient(supabaseUrl, supabaseKey)