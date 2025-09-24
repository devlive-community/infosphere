module.exports = {
    apps: [
        {
            name: 'infosphere',
            script: 'backend/app.js',
            instances: 1,
            exec_mode: 'cluster',
            autorestart: true,
            watch: false,
            max_memory_restart: '500M',
            env: {
                NODE_ENV: 'development'
            },
            env_production: {
                NODE_ENV: 'production'
            },
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: 'logs/error.log',
            out_file: 'logs/output.log',
            merge_logs: true
        }
    ],
    deploy: {
        production: {
            user: 'ubuntu',
            host: 'infosphere.devlive.top',
            ref: 'origin/dev',
            repo: 'https://github.com/devlive-community/infosphere.git',
            path: '/var/www/infosphere',
            'pre-deploy-local': '',
            'post-deploy': 'pnpm install && pnpm run build && pm2 reload ecosystem.config.js --env production',
            'pre-setup': '',
            'ssh_options': ['ForwardAgent=yes']
        }
    }
};