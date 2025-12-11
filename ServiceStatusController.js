const Pool = require('pg').Pool;

module.exports = {

  async Report(req, res) {
    const authHeader = req.headers.authorization;
    const FIXED_TOKEN = process.env.API_TOKEN || '123456'; 

    if (!authHeader || authHeader !== `Bearer ${FIXED_TOKEN}`) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or missing token' });
    }

    res.status(201).json({ message: 'Incident received' });

    try {
      const { parent_system, origin_service, error_message, criticality } = req.body;

      const pool = new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_WRITE_HOST,
        database: process.env.DB_DATABASE,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
      });

      // Auto-Discovery
      const checkService = await pool.query(
        "SELECT id FROM service_catalog WHERE parent_system = $1 AND origin_service = $2",
        [parent_system, origin_service]
      );

      let serviceId;

      if (checkService.rows.length > 0) {
        serviceId = checkService.rows[0].id;
      } else {
        const insertService = await pool.query(
          "INSERT INTO service_catalog (parent_system, origin_service) VALUES ($1, $2) RETURNING id",
          [parent_system, origin_service]
        );
        serviceId = insertService.rows[0].id;
      }

      // Inserir incidente
      await pool.query(
        "INSERT INTO incidents (service_id, error_message, criticality, timestamp) VALUES ($1, $2, $3, NOW())",
        [serviceId, error_message, criticality]
      );

      await pool.end();

    } catch (error) {
      console.error("Erro no ServiceStatusController.Report:", error);
    }
  },

  async GetStatus(req, res) {
    const authHeader = req.headers.authorization;
    const FIXED_TOKEN = process.env.API_TOKEN || '123456'; 

    if (!authHeader || authHeader !== `Bearer ${FIXED_TOKEN}`) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or missing token' });
    }

    try {
      const pool = new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_READ_HOST, 
        database: process.env.DB_DATABASE,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
      });

      const query = `
        SELECT 
          sc.parent_system,
          sc.origin_service,
          COUNT(i.id) AS error_count,
          MAX(i.criticality) AS max_criticality
        FROM service_catalog sc
        LEFT JOIN incidents i ON sc.id = i.service_id AND i.timestamp > NOW() - INTERVAL '30 minutes'
        GROUP BY sc.id, sc.parent_system, sc.origin_service
        ORDER BY error_count DESC
      `;

      const result = await pool.query(query);
      await pool.end();

      return res.json(result.rows);

    } catch (error) {
      console.error("Erro no ServiceStatusController.GetStatus:", error);
      return res.status(500).json({ message: 'Erro ao consultar status' });
    }
  }
};
