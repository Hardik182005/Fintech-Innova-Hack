# Module update: 1785604376-5
# Database connection pool manager
class ConnectionPool:
    def __init__(self, max_connections: int = 10):
        self.max_connections = max_connections
        self.active = 0

    def acquire(self):
        if self.active < self.max_connections:
            self.active += 1
            return True
        return False
