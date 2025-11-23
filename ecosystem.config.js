module.exports = {
  apps: [{
    name: 'universal-agent',
    script: 'src/index.js',
    instances: 1, // Test için tek instance
    exec_mode: 'fork', // Cluster yerine Fork modu (daha basit)
    env: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info'
    },
    // Memory leak olursa restart at (Güvenlik önlemi)
    max_memory_restart: '1G' 
  }]
};

