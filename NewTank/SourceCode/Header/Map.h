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
	int m_iBroken;//破坏性
	int m_iChartlet;//贴图编号
	int m_iProperty;//贴图属性
	int m_iNewPosX;
	int m_iNewPosY;
	float m_fMinBox;
public:
	//main
	CMap(const char *szname);
	virtual ~CMap();
	void Init();
	void ChangeProperty();
	//Set
	void SetTanksTrans(int tankstrans) {m_iTanksTrans = tankstrans;}
	void SetBulletsTrans(int bulletstrans) {m_iBulletsTrans = bulletstrans;}
	void SetChartlet(int chartlet) {m_iChartlet = chartlet;}
	void SetNewPosX(int newposx) {m_iNewPosX = newposx;}
	void SetNewPosY(int newposy) {m_iNewPosY = newposy;}
	void SetProperty(int property) {m_iProperty = property;}
	void SetBroken(int broken) {m_iBroken = broken;}
	//Get
	int GetTanksTrans() {return m_iTanksTrans;}
	int GetBulletsTrans() {return m_iBulletsTrans;}
	int GetChartlet() {return m_iChartlet;}
	int GetNewPosX() {return m_iNewPosX;}
	int GetNewPosY() {return m_iNewPosY;}
	int GetProperty() {return m_iProperty;}
	int GetBroken() {return m_iBroken;}
};

#endif // !defined(AFX_MAP_H__75F446A9_9D18_4FFE_BCD2_53AA24A3DE25__INCLUDED_)
