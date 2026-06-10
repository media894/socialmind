from django.urls import path
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from celery.result import AsyncResult


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def task_status(request, task_id):
    result = AsyncResult(task_id)
    response = {
        'task_id': task_id,
        'status': result.status,
        'ready': result.ready(),
    }
    if result.ready():
        if result.successful():
            response['result'] = result.result
        else:
            response['error'] = str(result.result)
    elif result.status == 'PROGRESS':
        response['info'] = result.info
    return Response(response)


urlpatterns = [
    path('<str:task_id>/', task_status, name='task-status'),
]
