package com.yosesproject.dummy;
import android.appwidget.AppWidgetProvider;
import android.appwidget.AppWidgetManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
public class DummyWideWidget extends AppWidgetProvider {
 @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
  for(int id: ids) {
   RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.dummy_widget);
   Intent intent = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
   views.setOnClickPendingIntent(R.id.dummy_widget_art, PendingIntent.getActivity(context,id,intent,PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
   manager.updateAppWidget(id,views);
  }
 }
}