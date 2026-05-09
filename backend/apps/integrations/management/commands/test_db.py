import os
import sys
import logging
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.conf import settings

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Test database connection and verify RAG setup'

    def add_arguments(self, parser):
        parser.add_argument(
            '--full',
            action='store_true',
            help='Run full diagnostic including table counts'
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('\n' + '='*60))
        self.stdout.write(self.style.SUCCESS('  ATLAS Database Connection & Setup Test'))
        self.stdout.write(self.style.SUCCESS('='*60 + '\n'))

        # Test 1: Database Configuration
        self.test_database_config()

        # Test 2: Database Connection
        self.test_connection()

        # Test 3: RAG Tables
        self.test_rag_tables()

        # Test 4: User Count
        self.test_user_count()

        # Test 5: Full Diagnostic
        if options['full']:
            self.test_full_diagnostic()

        self.stdout.write(self.style.SUCCESS('\n' + '='*60))
        self.stdout.write(self.style.SUCCESS('  ✓ All tests completed'))
        self.stdout.write(self.style.SUCCESS('='*60 + '\n'))

    def test_database_config(self):
        """Test database configuration"""
        self.stdout.write(self.style.WARNING('\n▶ Database Configuration'))
        
        db_config = settings.DATABASES['default']
        
        self.stdout.write(f"  Engine: {db_config.get('ENGINE')}")
        self.stdout.write(f"  Name: {db_config.get('NAME')}")
        self.stdout.write(f"  User: {db_config.get('USER')}")
        self.stdout.write(f"  Host: {db_config.get('HOST')}")
        self.stdout.write(f"  Port: {db_config.get('PORT')}")

    def test_connection(self):
        """Test actual database connection"""
        self.stdout.write(self.style.WARNING('\n▶ Testing Database Connection'))
        
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT version();")
                version = cursor.fetchone()
                self.stdout.write(self.style.SUCCESS('  ✓ Connection successful'))
                self.stdout.write(f'  PostgreSQL: {version[0][:50]}...')
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'  ✗ Connection failed: {str(e)}'))
            raise CommandError(f'Database connection failed: {str(e)}')

    def test_rag_tables(self):
        """Test RAG tables existence"""
        self.stdout.write(self.style.WARNING('\n▶ Checking RAG Tables'))
        
        try:
            with connection.cursor() as cursor:
                # Check global_document table
                cursor.execute("""
                    SELECT EXISTS (
                        SELECT 1 FROM information_schema.tables 
                        WHERE table_name = 'global_document'
                    );
                """)
                global_doc_exists = cursor.fetchone()[0]
                
                # Check global_document_chunk table
                cursor.execute("""
                    SELECT EXISTS (
                        SELECT 1 FROM information_schema.tables 
                        WHERE table_name = 'global_document_chunk'
                    );
                """)
                global_chunk_exists = cursor.fetchone()[0]
                
                if global_doc_exists and global_chunk_exists:
                    self.stdout.write(self.style.SUCCESS('  ✓ RAG tables exist'))
                    
                    # Get counts
                    cursor.execute("SELECT COUNT(*) FROM global_document;")
                    doc_count = cursor.fetchone()[0]
                    self.stdout.write(f'    - Global documents: {doc_count}')
                    
                    cursor.execute("SELECT COUNT(*) FROM global_document_chunk;")
                    chunk_count = cursor.fetchone()[0]
                    self.stdout.write(f'    - Global chunks: {chunk_count}')
                else:
                    if not global_doc_exists:
                        self.stdout.write(self.style.ERROR('  ✗ global_document table missing'))
                    if not global_chunk_exists:
                        self.stdout.write(self.style.ERROR('  ✗ global_document_chunk table missing'))
                    self.stdout.write(self.style.WARNING('  → Run: python manage.py migrate'))
                    
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'  ✗ Error checking tables: {str(e)}'))

    def test_user_count(self):
        """Test user count"""
        self.stdout.write(self.style.WARNING('\n▶ Checking Users'))
        
        try:
            from django.contrib.auth.models import User
            
            count = User.objects.count()
            self.stdout.write(self.style.SUCCESS(f'  ✓ Users found: {count}'))
            
            if count == 0:
                self.stdout.write(self.style.WARNING('  → No users yet. Create one with:'))
                self.stdout.write('    python manage.py createsuperuser')
            else:
                # List users
                users = User.objects.values_list('username', 'is_staff')[:5]
                for username, is_staff in users:
                    role = '(staff)' if is_staff else '(user)'
                    self.stdout.write(f'    - {username} {role}')
                    
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'  ✗ Error checking users: {str(e)}'))

    def test_full_diagnostic(self):
        """Full diagnostic of all tables"""
        self.stdout.write(self.style.WARNING('\n▶ Full Diagnostic (All Tables)'))
        
        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT table_name FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    ORDER BY table_name;
                """)
                
                tables = cursor.fetchall()
                
                if not tables:
                    self.stdout.write(self.style.ERROR('  ✗ No tables found'))
                    return
                
                self.stdout.write(self.style.SUCCESS(f'  ✓ Found {len(tables)} tables:'))
                
                for (table_name,) in tables:
                    cursor.execute(f"SELECT COUNT(*) FROM {table_name};")
                    count = cursor.fetchone()[0]
                    self.stdout.write(f'    - {table_name}: {count} rows')
                    
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'  ✗ Error in diagnostic: {str(e)}'))
