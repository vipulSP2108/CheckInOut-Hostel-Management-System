import { executeQuery } from '../../app/src/db/router.js';

async function demoRouting() {
  console.log('--- Targeted Query Routing Demo ---');
  
  // Example identification number (using 2022001 which is in our seed data)
  const shardKey = '22110189'; 
  
  console.log(`Querying Member with IdentificationNumber: ${shardKey}`);
  console.log('Router will determine the shard and execute a targeted MySQL query.');

  try {
    const member = await executeQuery({
      sql: 'SELECT * FROM Member WHERE IdentificationNumber = ?',
      params: [shardKey],
      shardKey: shardKey, // Passing shardKey triggers targeted routing
      type: 'get'
    });

    if (member) {
      console.log('-------------------------------------------');
      console.log('         MEMBER PROFILE (DASHBOARD)        ');
      console.log('-------------------------------------------');
      console.log(`- ID Number:   ${member.IdentificationNumber}`);
      console.log(`- Full Name:   ${member.Name}`);
      console.log(`- Email:       ${member.Email}`);
      console.log(`- Contact:     ${member.ContactNumber}`);
      console.log(`- Department:  ${member.Department}`);
      console.log(`- Year:        ${member.YearOfStudy}`);
      console.log(`- Gender:      ${member.Gender}`);
      console.log(`- Purpose:     ${member.PurposeOfStay}`);
      console.log('-------------------------------------------');
      console.log('SUCCESS: Target shard was correctly hit.');
    } else {
      console.log('Member not found in the shard.');
    }
  } catch (error) {
    console.error('Routing Demo Error:', error.message);
  }
}

demoRouting();
