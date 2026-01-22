const express = require('express');
const router = express.Router();

const { logger } = require('../logger');

// Challenge data with answers for CTF export
// This should provide the same data as the original WrongSecrets /api/challenges endpoint
const getChallengeData = () => {
  return {
    data: [
      {
        key: 'challenge0',
        name: 'Challenge 0 - The First Answer',
        description: 'Find the first secret',
        difficulty: 1,
        answer: 'Flag: are you having fun yet?', // Decoded from RmxhZzogYXJlIHlvdSBoYXZpbmcgZnVuIHlldD8=
        category: 'basics'
      },
      {
        key: 'challenge1',
        name: 'Challenge 1 - Docker Secrets',
        description: 'Find the secret in Docker',
        difficulty: 1,
        answer: 'if_you_read_this_you_are_on_the_right_track',
        category: 'docker'
      },
      {
        key: 'challenge2',
        name: 'Challenge 2 - Config Maps',
        description: 'Find the secret in ConfigMaps',
        difficulty: 1,
        answer: 'helloCTF-configmap',
        category: 'kubernetes'
      },
      {
        key: 'challenge3',
        name: 'Challenge 3 - Secrets',
        description: 'Find the secret in Kubernetes Secrets',
        difficulty: 1,
        answer: 'Flag: are you having fun yet?',
        category: 'kubernetes'
      },
      {
        key: 'challenge4',
        name: 'Challenge 4 - Environment Variables',
        description: 'Find the secret in environment variables',
        difficulty: 2,
        answer: 'this_is_from_an_env_variable_and_is_not_that_hard_but_maybe_later',
        category: 'environment'
      },
      {
        key: 'challenge5',
        name: 'Challenge 5 - Volume Mounts',
        description: 'Find the secret in volume mounts',
        difficulty: 2,
        answer: 'this_is_from_a_volume_and_is_also_easy',
        category: 'storage'
      },
      {
        key: 'challenge6',
        name: 'Challenge 6 - Temporary Directory',
        description: 'Find the secret in temporary directory',
        difficulty: 2,
        answer: 'this_is_from_tmp_and_is_also_easy',
        category: 'storage'
      },
      {
        key: 'challenge7',
        name: 'Challenge 7 - Secret Manager',
        description: 'Find the secret in secret manager',
        difficulty: 4,
        answer: 'this_is_from_secret_manager_and_is_hard_to_guess',
        category: 'cloud'
      },
      {
        key: 'challenge8',
        name: 'Challenge 8 - CTF Key Exchange',
        description: 'Exchange the CTF key',
        difficulty: 2,
        answer: 'provideThisKeyToHostThankyouAlllGoodDoYouLikeRandomLogging?',
        category: 'ctf'
      },
      {
        key: 'challenge9',
        name: 'Challenge 9 - AWS Secrets Manager 1',
        description: 'Find the secret in AWS Secrets Manager',
        difficulty: 3,
        answer: 'aws_secret_1_answer',
        category: 'aws'
      },
      {
        key: 'challenge10',
        name: 'Challenge 10 - AWS Secrets Manager 2',
        description: 'Find the second secret in AWS Secrets Manager',
        difficulty: 4,
        answer: 'aws_secret_2_answer',
        category: 'aws'
      },
      {
        key: 'challenge11',
        name: 'Challenge 11 - AWS Parameter Store',
        description: 'Find the secret in AWS Parameter Store',
        difficulty: 4,
        answer: 'parameter_store_secret',
        category: 'aws'
      },
      {
        key: 'challenge12',
        name: 'Challenge 12 - AWS EC2 User Data',
        description: 'Find the secret in EC2 user data',
        difficulty: 3,
        answer: 'ec2_user_data_secret',
        category: 'aws'
      },
      {
        key: 'challenge13',
        name: 'Challenge 13 - AWS S3 Bucket',
        description: 'Find the secret in S3 bucket',
        difficulty: 3,
        answer: 's3_bucket_secret',
        category: 'aws'
      },
      {
        key: 'challenge14',
        name: 'Challenge 14 - AWS CloudFormation',
        description: 'Find the secret in CloudFormation',
        difficulty: 4,
        answer: 'cloudformation_secret',
        category: 'aws'
      },
      {
        key: 'challenge15',
        name: 'Challenge 15 - AWS Lambda',
        description: 'Find the secret in AWS Lambda',
        difficulty: 2,
        answer: 'lambda_secret',
        category: 'aws'
      },
      {
        key: 'challenge16',
        name: 'Challenge 16 - AWS ECS Task',
        description: 'Find the secret in ECS task',
        difficulty: 3,
        answer: 'ecs_task_secret',
        category: 'aws'
      },
      {
        key: 'challenge17',
        name: 'Challenge 17 - AWS EKS Secret',
        description: 'Find the secret in EKS',
        difficulty: 3,
        answer: 'eks_secret',
        category: 'aws'
      },
      {
        key: 'challenge18',
        name: 'Challenge 18 - AWS RDS',
        description: 'Find the secret in RDS',
        difficulty: 5,
        answer: 'rds_secret',
        category: 'aws'
      },
      {
        key: 'challenge19',
        name: 'Challenge 19 - AWS ElastiCache',
        description: 'Find the secret in ElastiCache',
        difficulty: 4,
        answer: 'elasticache_secret',
        category: 'aws'
      },
      {
        key: 'challenge20',
        name: 'Challenge 20 - AWS DocumentDB',
        description: 'Find the secret in DocumentDB',
        difficulty: 4,
        answer: 'documentdb_secret',
        category: 'aws'
      },
      {
        key: 'challenge21',
        name: 'Challenge 21 - AWS MQ',
        description: 'Find the secret in MQ',
        difficulty: 5,
        answer: 'mq_secret',
        category: 'aws'
      },
      {
        key: 'challenge22',
        name: 'Challenge 22 - AWS Step Functions',
        description: 'Find the secret in Step Functions',
        difficulty: 5,
        answer: 'stepfunctions_secret',
        category: 'aws'
      },
      {
        key: 'challenge23',
        name: 'Challenge 23 - AWS Secrets Manager Challenge',
        description: 'Advanced AWS Secrets Manager challenge',
        difficulty: 1,
        answer: 'advanced_aws_secret',
        category: 'aws'
      },
      {
        key: 'challenge24',
        name: 'Challenge 24 - AWS CloudTrail',
        description: 'Find the secret in CloudTrail',
        difficulty: 2,
        answer: 'cloudtrail_secret',
        category: 'aws'
      },
      {
        key: 'challenge25',
        name: 'Challenge 25 - AWS Config',
        description: 'Find the secret in AWS Config',
        difficulty: 2,
        answer: 'config_secret',
        category: 'aws'
      },
      {
        key: 'challenge26',
        name: 'Challenge 26 - AWS GuardDuty',
        description: 'Find the secret in GuardDuty',
        difficulty: 2,
        answer: 'guardduty_secret',
        category: 'aws'
      },
      {
        key: 'challenge27',
        name: 'Challenge 27 - AWS Secrets Manager Final',
        description: 'Final AWS Secrets Manager challenge',
        difficulty: 2,
        answer: 'final_aws_secret',
        category: 'aws'
      },
      {
        key: 'challenge30',
        name: 'Challenge 30 - CTF Exchange',
        description: 'Exchange CTF key for challenge 30',
        difficulty: 3,
        answer: 'provideThisKeyToHostWhenYouRealizeLSIsOK?',
        category: 'ctf'
      },
      {
        key: 'challenge33',
        name: 'Challenge 33 - Sealed Secrets',
        description: 'Find the secret in sealed secrets',
        difficulty: 2,
        answer: process.env.CHALLENGE33_VALUE || 'default-challenge33-value',
        category: 'kubernetes'
      },
      {
        key: 'challenge53',
        name: 'Challenge 53 - Advanced Kubernetes',
        description: 'Advanced Kubernetes challenge',
        difficulty: 3,
        answer: 'advanced_kubernetes_secret',
        category: 'kubernetes'
      }
    ]
  };
};

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
async function getChallenges(req, res) {
  try {
    logger.info('Retrieving challenge data for CSV export');
    
    const challengeData = getChallengeData();
    
    // Support both JSON and CSV formats
    const format = req.query.format || 'json';
    
    if (format === 'csv') {
      // Generate CSV format
      const csvHeader = 'Challenge,Name,Description,Difficulty,Answer,Category\n';
      const csvRows = challengeData.data.map(challenge => 
        `"${challenge.key}","${challenge.name}","${challenge.description}",${challenge.difficulty},"${challenge.answer}","${challenge.category}"`
      ).join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="challenges.csv"');
      res.send(csvHeader + csvRows);
    } else {
      // Return JSON format
      res.json(challengeData);
    }
  } catch (error) {
    logger.error('Error retrieving challenge data:', error.message);
    res.status(500).json({
      error: 'Failed to retrieve challenge data',
      message: error.message
    });
  }
}

router.get('/challenges', getChallenges);

module.exports = router;
