module.exports = {
  apps: [{
    name: 'universal-agent',
    script: 'src/index.js',
    instances: 'max', // Tüm CPU çekirdeklerini kullan
    exec_mode: 'cluster', // Cluster modu (Load Balancing)
    env: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info'
    },
    // Memory leak olursa restart at (Güvenlik önlemi)
    max_memory_restart: '1G' 
  }]
};

