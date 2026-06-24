alter table public.jobs
add column if not exists job_type text not null default 'internship'
check (job_type in ('internship', 'fulltime'));

notify pgrst, 'reload schema';