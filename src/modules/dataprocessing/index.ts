/**
 * Data Processing & ML Deployment Modules
 *
 * Production-ready modules for data warehousing, streaming, and ML model deployment.
 * All modules include circuit breakers, rate limiting, and structured logging.
 *
 * Categories:
 * - Data Warehouses: Snowflake, BigQuery, Redshift
 * - Message Streaming: Kafka, RabbitMQ
 * - ML Deployment: HuggingFace, Replicate
 *
 * Usage in workflows:
 * - dataprocessing.snowflake.executeQuery
 * - dataprocessing.bigquery.runQuery
 * - dataprocessing.kafka.produceMessage
 * - dataprocessing.huggingface.runInference
 */

// Snowflake Data Warehouse (6 functions)
export {
  executeQuery as snowflakeExecuteQuery,
  loadData as snowflakeLoadData,
  createTable as snowflakeCreateTable,
  getQueryResults as snowflakeGetQueryResults,
  listTables as snowflakeListTables,
  dropTable as snowflakeDropTable,
} from './snowflake';

// Google BigQuery (7 functions)
export {
  runQuery as bigqueryRunQuery,
  loadData as bigqueryLoadData,
  createDataset as bigqueryCreateDataset,
  getJobResults as bigqueryGetJobResults,
  listDatasets as bigqueryListDatasets,
  listTables as bigqueryListTables,
  insertRows as bigqueryInsertRows,
} from './bigquery';

// AWS Redshift (6 functions)
export {
  executeQuery as redshiftExecuteQuery,
  loadData as redshiftLoadData,
  createTable as redshiftCreateTable,
  getQueryResults as redshiftGetQueryResults,
  listTables as redshiftListTables,
  vacuumTable as redshiftVacuumTable,
} from './redshift';

// Apache Kafka (6 functions)
export {
  produceMessage as kafkaProduceMessage,
  createTopic as kafkaCreateTopic,
  getTopicInfo as kafkaGetTopicInfo,
  listTopics as kafkaListTopics,
  deleteTopic as kafkaDeleteTopic,
  listConsumerGroups as kafkaListConsumerGroups,
} from './kafka';

// RabbitMQ (7 functions)
export {
  publishMessage as rabbitmqPublishMessage,
  createQueue as rabbitmqCreateQueue,
  getQueueInfo as rabbitmqGetQueueInfo,
  createExchange as rabbitmqCreateExchange,
  bindQueue as rabbitmqBindQueue,
  deleteQueue as rabbitmqDeleteQueue,
  purgeQueue as rabbitmqPurgeQueue,
} from './rabbitmq';

// HuggingFace Models (7 functions)
export {
  runInference as huggingfaceRunInference,
  listModels as huggingfaceListModels,
  getModelInfo as huggingfaceGetModelInfo,
  generateText as huggingfaceGenerateText,
  classifyText as huggingfaceClassifyText,
  answerQuestion as huggingfaceAnswerQuestion,
  classifyImage as huggingfaceClassifyImage,
} from './huggingface';

// Replicate ML (6 functions)
export {
  runPrediction as replicateRunPrediction,
  getPrediction as replicateGetPrediction,
  cancelPrediction as replicateCancelPrediction,
  listModels as replicateListModels,
  getModelInfo as replicateGetModelInfo,
  waitForPrediction as replicateWaitForPrediction,
} from './replicate';

/**
 * Module Function Count Summary:
 * - Snowflake: 6 functions
 * - BigQuery: 7 functions
 * - Redshift: 6 functions
 * - Kafka: 6 functions
 * - RabbitMQ: 7 functions
 * - HuggingFace: 7 functions
 * - Replicate: 6 functions
 * --------------------------------
 * Total: 45 functions across 7 modules
 */
