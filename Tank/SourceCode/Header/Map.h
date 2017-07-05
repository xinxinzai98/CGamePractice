// Map.h: interface for the CMap class.
//
//////////////////////////////////////////////////////////////////////

#if !defined(AFX_MAP_H__75F446A9_9D18_4FFE_BCD2_53AA24A3DE25__INCLUDED_)
#define AFX_MAP_H__75F446A9_9D18_4FFE_BCD2_53AA24A3DE25__INCLUDED_

#include "CommonClass.h"

#if _MSC_VER > 1000
#pragma once
#endif // _MSC_VER > 1000

class CMap : public CAnimateSprite  
{
private:
	int m_iTanksTrans;//坦克通过性
	int m_iBulletsTrans;//子弹通过性
	int m_iChartlet;//贴图编号
public:
	//main
	CMap(const char *szname);
	virtual ~CMap();
	void Init();
	//Set
	void SetTanksTrans(int tankstrans) {m_iTanksTrans = tankstrans;}
	void SetBulletsTrans(int bulletstrans) {m_iBulletsTrans = bulletstrans;}
	void SetChartlet(int chartlet) {m_iChartlet = chartlet;}
	//Get
	int GetTanksTrans() {return m_iTanksTrans;}
	int GetBulletsTrans() {return m_iBulletsTrans;}
	int GetChartlet() {return m_iChartlet;}

};

#endif // !defined(AFX_MAP_H__75F446A9_9D18_4FFE_BCD2_53AA24A3DE25__INCLUDED_)
