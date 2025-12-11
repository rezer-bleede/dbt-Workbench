
  
    
    

    create  table
      "memory"."main"."example_model__dbt_tmp"
  
    as (
      

select 
    1 as id,
    'test' as name,
    current_timestamp as created_at
    );
  
  